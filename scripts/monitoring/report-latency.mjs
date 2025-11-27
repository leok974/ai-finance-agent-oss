#!/usr/bin/env node
/**
 * Latency Report Generator with Provider Breakdown
 *
 * Processes edge-verify.json and similar latency data files to generate
 * p50/p95 reports broken down by provider (primary vs fallback).
 *
 * Usage:
 *   node scripts/report-latency.mjs
 *   node scripts/report-latency.mjs --input edge-verify.json --format json
 *   node scripts/report-latency.mjs --input "test-results/*.json" --rollup
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : defaultValue;
};

const inputPattern = getArg('--input', 'edge-verify.json');
const format = getArg('--format', 'table'); // table, json, prometheus
const rollup = args.includes('--rollup');

function calculatePercentiles(values) {
  if (!values || values.length === 0) return { p50: null, p95: null, min: null, max: null, count: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;

  const p50Index = Math.ceil(count * 0.5) - 1;
  const p95Index = Math.ceil(count * 0.95) - 1;

  return {
    p50: sorted[p50Index],
    p95: sorted[p95Index],
    min: sorted[0],
    max: sorted[count - 1],
    count
  };
}

function extractLatencyData(data) {
  const latencies = [];

  // Extract from different data sources
  if (data.llm) {
    // Enhanced edge-verify format
    if (data.llm.echo && data.llm.echo.latency_ms) {
      latencies.push({
        type: 'llm_echo',
        latency_ms: data.llm.echo.latency_ms,
        provider: data.llm.echo.provider || 'unknown',
        timestamp: data.timestamp || new Date().toISOString()
      });
    }

    if (data.llm.stream) {
      if (data.llm.stream.first_chunk_latency_ms) {
        latencies.push({
          type: 'stream_first_chunk',
          latency_ms: data.llm.stream.first_chunk_latency_ms,
          provider: data.llm.stream.provider || 'unknown',
          timestamp: data.timestamp || new Date().toISOString()
        });
      }

      if (data.llm.stream.total_latency_ms) {
        latencies.push({
          type: 'stream_total',
          latency_ms: data.llm.stream.total_latency_ms,
          provider: data.llm.stream.provider || 'unknown',
          timestamp: data.timestamp || new Date().toISOString()
        });
      }
    }
  }

  // Extract from standard edge-verify format
  if (data.endpoints) {
    ['healthz', 'ready', 'live', 'up', 'llm_health', 'agui_ping'].forEach(endpoint => {
      if (data.endpoints[endpoint] && typeof data.endpoints[endpoint].latency_ms === 'number') {
        latencies.push({
          type: `endpoint_${endpoint}`,
          latency_ms: data.endpoints[endpoint].latency_ms,
          provider: 'primary', // Standard endpoints use primary backend
          timestamp: data.timestamp || new Date().toISOString()
        });
      }
    });
  }

  // Extract from Playwright test results
  if (data.tests && Array.isArray(data.tests)) {
    data.tests.forEach(test => {
      if (test.results && Array.isArray(test.results)) {
        test.results.forEach(result => {
          if (result.duration) {
            latencies.push({
              type: 'test_duration',
              latency_ms: result.duration,
              provider: process.env.STREAM_LATENCY_LOG ? 'monitored' : 'unknown',
              timestamp: result.startTime || new Date().toISOString(),
              test: test.title
            });
          }
        });
      }
    });
  }

  return latencies;
}

function processFiles(files) {
  const allLatencies = [];
  const errors = [];

  files.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(content);
      const latencies = extractLatencyData(data);

      latencies.forEach(lat => {
        lat.source_file = path.basename(file);
        allLatencies.push(lat);
      });
    } catch (error) {
      errors.push({ file, error: error.message });
    }
  });

  return { latencies: allLatencies, errors };
}

function generateReport(latencies) {
  // Group by type and provider
  const grouped = {};

  latencies.forEach(lat => {
    const key = `${lat.type}`;
    if (!grouped[key]) grouped[key] = {};

    const provider = lat.provider || 'unknown';
    if (!grouped[key][provider]) grouped[key][provider] = [];

    grouped[key][provider].push(lat.latency_ms);
  });

  // Calculate statistics
  const report = {};

  Object.keys(grouped).forEach(type => {
    report[type] = {};

    Object.keys(grouped[type]).forEach(provider => {
      const values = grouped[type][provider];
      report[type][provider] = calculatePercentiles(values);
    });
  });

  return report;
}

function formatTable(report) {
  console.log('\n📊 Latency Report by Provider\n');
  console.log('Type'.padEnd(25) + 'Provider'.padEnd(15) + 'Count'.padEnd(8) + 'P50ms'.padEnd(8) + 'P95ms'.padEnd(8) + 'Min'.padEnd(8) + 'Max'.padEnd(8));
  console.log('─'.repeat(80));

  Object.keys(report).sort().forEach(type => {
    Object.keys(report[type]).sort().forEach(provider => {
      const stats = report[type][provider];
      console.log(
        type.padEnd(25) +
        provider.padEnd(15) +
        stats.count.toString().padEnd(8) +
        (stats.p50 || 'N/A').toString().padEnd(8) +
        (stats.p95 || 'N/A').toString().padEnd(8) +
        (stats.min || 'N/A').toString().padEnd(8) +
        (stats.max || 'N/A').toString().padEnd(8)
      );
    });
  });

  console.log('\n💡 Tips:');
  console.log('• Primary provider should show lower latencies');
  console.log('• High fallback P95 suggests primary provider issues');
  console.log('• Use --format=prometheus for metrics ingestion');
}

function formatJson(report) {
  console.log(JSON.stringify(report, null, 2));
}

function formatPrometheus(report) {
  console.log('# HELP latency_percentile_ms Latency percentiles by type and provider');
  console.log('# TYPE latency_percentile_ms gauge');

  Object.keys(report).forEach(type => {
    Object.keys(report[type]).forEach(provider => {
      const stats = report[type][provider];
      const labels = `type="${type}",provider="${provider}"`;

      if (stats.p50 !== null) {
        console.log(`latency_percentile_ms{${labels},percentile="50"} ${stats.p50}`);
      }
      if (stats.p95 !== null) {
        console.log(`latency_percentile_ms{${labels},percentile="95"} ${stats.p95}`);
      }
      console.log(`latency_count{${labels}} ${stats.count}`);
    });
  });
}

async function main() {
  try {
    // Find input files
    const files = await glob(inputPattern, { nonull: false });

    if (files.length === 0) {
      console.error(`❌ No files found matching: ${inputPattern}`);
      process.exit(1);
    }

    console.log(`📁 Processing ${files.length} file(s)...`);

    // Process files
    const { latencies, errors } = processFiles(files);

    if (errors.length > 0) {
      console.warn(`⚠️  Errors processing ${errors.length} files:`);
      errors.forEach(err => console.warn(`   ${err.file}: ${err.error}`));
    }

    if (latencies.length === 0) {
      console.warn('⚠️  No latency data found in input files');
      return;
    }

    console.log(`📈 Found ${latencies.length} latency measurements`);

    // Generate report
    const report = generateReport(latencies);

    // Output in requested format
    switch (format) {
      case 'json':
        formatJson(report);
        break;
      case 'prometheus':
        formatPrometheus(report);
        break;
      case 'table':
      default:
        formatTable(report);
        break;
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
