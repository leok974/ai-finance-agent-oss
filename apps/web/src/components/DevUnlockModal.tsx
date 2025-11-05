// apps/web/src/components/DevUnlockModal.tsx
/**
 * Dev Unlock Modal - PIN entry for developer superuser features
 * Only shown to users with DEV_SUPERUSER_EMAIL in dev environment
 */
import React, { useState } from 'react';
import { useDev } from '@/state/dev';
import { http } from '@/lib/http';

interface DevUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DevUnlockModal({ isOpen, onClose, onSuccess }: DevUnlockModalProps) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setUnlocked } = useDev();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Normalize PIN: strip non-digits and validate length
    const normalizedPin = pin.replace(/\D/g, '').slice(0, 8);
    if (normalizedPin.length !== 8) {
      setError('PIN must be 8 digits.');
      return;
    }

    setLoading(true);

    try {
      // Backend expects FormData (not JSON)
      // POST /api/auth/dev/unlock with form fields
      const formData = new FormData();
      formData.append('pin', normalizedPin);

      await http('/api/auth/dev/unlock', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - browser will set it automatically with boundary
      });

      // Success! Backend validated PIN (204 response), update client state
      setUnlocked(true);
      onSuccess();
      onClose();
      // Reset form
      setPin('');
    } catch (err: unknown) {
      // Extract detail from error message or provide fallback
      let msg = 'Unable to unlock. Check PIN and try again.';
      if (err instanceof Error) {
        // http() throws "HTTP 422 Unprocessable Entity /auth/dev/unlock"
        if (err.message.includes('422')) {
          msg = 'Invalid PIN or email format.';
        } else if (err.message.includes('401') || err.message.includes('403')) {
          msg = 'Invalid PIN.';
        } else {
          msg = err.message;
        }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPin('');
    setError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          🔓 Unlock Dev Tools
        </h2>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Enter your 8-digit PIN to enable developer features.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="pin"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              PIN
            </label>
            <input
              id="pin"
              data-testid="pin-input"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         text-center text-2xl tracking-widest font-mono"
              placeholder="••••••••"
              autoFocus
              disabled={loading}
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">
                ❌ {error}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600
                         text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50
                         dark:hover:bg-gray-700 disabled:opacity-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="pin-submit"
              disabled={loading || pin.length !== 8}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md
                         disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Verifying...' : 'Unlock'}
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
          Dev tools include RAG management, seed data, and debug features.
        </p>
      </div>
    </div>
  );
}
