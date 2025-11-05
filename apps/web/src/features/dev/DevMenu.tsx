import { useDev } from '@/state/dev';
import { Wrench, Sparkles, DatabaseZap, RefreshCw, LayoutDashboard, Cpu } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

const FAST = 'llama3:latest';
const HEAVY = 'gpt-oss:20b';

type DevMenuProps = {
  adminRulesOpen?: boolean;
  onToggleAdminRules?: () => void;
  adminKnowledgeOpen?: boolean;
  onToggleAdminKnowledge?: () => void;
  openDevDock?: boolean;
  onToggleDevDock?: () => void;
};

export function DevMenu({
  adminRulesOpen,
  onToggleAdminRules,
  adminKnowledgeOpen,
  onToggleAdminKnowledge,
  openDevDock,
  onToggleDevDock
}: DevMenuProps) {
  const { isUnlocked, seedDemoData, clearDb, refreshModels, openPlannerPanel, modelOverride, setModelOverride } = useDev();
  const { toast } = useToast();

  const setModel = (m: string | null) => {
    setModelOverride(m);
    toast({
      title: 'Model updated',
      description: m ? `Using ${m} for this tab` : 'Cleared override (backend default)'
    });
  };

  // If not unlocked, show disabled pill with tooltip
  if (!isUnlocked) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                variant="pill"
                size="sm"
                className="gap-2"
                disabled
                data-testid="dev-trigger"
              >
                <Wrench className="size-4" />
                Dev
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Unlock from Account menu to enable dev tools</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="pill" size="sm" className="gap-2" data-testid="dev-trigger">
          <Wrench className="size-4" />
          Dev <span className="text-green-400">✓</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Dev Tools</DropdownMenuLabel>
        <DropdownMenuItem onClick={seedDemoData} className="gap-2" data-testid="dev-seed-data">
          <Sparkles className="size-4" />
          Seed Demo Data
        </DropdownMenuItem>
        <DropdownMenuItem onClick={clearDb} className="gap-2 text-destructive" data-testid="dev-clear-db">
          <DatabaseZap className="size-4" />
          Clear DB
        </DropdownMenuItem>
        <DropdownMenuItem onClick={openPlannerPanel} className="gap-2" data-testid="dev-planner">
          <LayoutDashboard className="size-4" />
          Open Planner Panel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={refreshModels} className="gap-2" data-testid="dev-refresh-models">
          <RefreshCw className="size-4" />
          Refresh Models
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2">
          <Cpu className="size-4" />
          LLM Model (tab-scoped)
        </DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={modelOverride === FAST}
          onCheckedChange={() => setModel(modelOverride === FAST ? null : FAST)}
          data-testid="dev-model-fast"
        >
          llama3 (Fast, 8B)
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={modelOverride === HEAVY}
          onCheckedChange={() => setModel(modelOverride === HEAVY ? null : HEAVY)}
          data-testid="dev-model-20b"
        >
          gpt-oss (20B)
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Panels</DropdownMenuLabel>
        {onToggleAdminRules && (
          <DropdownMenuCheckboxItem
            checked={adminRulesOpen}
            onCheckedChange={onToggleAdminRules}
            className="gap-2"
          >
            Admin Rules
          </DropdownMenuCheckboxItem>
        )}
        {onToggleAdminKnowledge && (
          <DropdownMenuCheckboxItem
            checked={adminKnowledgeOpen}
            onCheckedChange={onToggleAdminKnowledge}
            className="gap-2"
          >
            Admin Knowledge
          </DropdownMenuCheckboxItem>
        )}
        {onToggleDevDock && (
          <DropdownMenuCheckboxItem
            checked={openDevDock}
            onCheckedChange={onToggleDevDock}
            className="gap-2"
          >
            Dev Dock
          </DropdownMenuCheckboxItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default DevMenu;
