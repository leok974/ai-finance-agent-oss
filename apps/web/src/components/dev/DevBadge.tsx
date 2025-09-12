import { useEffect, useState } from "react"
import { GitBranch, Check, Rocket, ShieldCheck, Settings2, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Flags = {
  dev: boolean
  ruleTester: boolean
  mlSelftest: boolean
  planner: boolean
}

function read(key: string, fallback = "0") {
  return (localStorage.getItem(key) ?? fallback) === "1"
}
function write(key: string, on: boolean) {
  localStorage.setItem(key, on ? "1" : "0")
}

type Props = {
  branch?: string;
  commit?: string;
  openDevDock?: boolean;
  onToggleDevDock?: () => void;
}

export default function DevBadge({ branch, commit, openDevDock, onToggleDevDock }: Props) {
  const [flags, setFlags] = useState<Flags>({ dev: true, ruleTester: true, mlSelftest: true, planner: true })

  useEffect(() => {
    setFlags({
      dev: read("DEV_UI", "1"),
      ruleTester: read("FEATURE_RULE_TESTER", "1"),
      mlSelftest: read("FEATURE_ML_SELFTEST", "1"),
      planner: read("FEATURE_PLANNER", "1"),
    })
  }, [])

  const toggle = (key: keyof Flags, storageKey: string) => (v: boolean) => {
    setFlags(s => ({ ...s, [key]: v }))
    write(storageKey, v)
  }

  const reload = () => window.location.reload()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          className="h-7 gap-1 rounded-full border-white/15 bg-white/5 px-2 py-0 text-xs"
          title={branch ? `branch: ${branch}${commit ? ` @ ${commit.slice(0,7)}` : ''}` : undefined}
        >
          <GitBranch className="h-3.5 w-3.5" />
          <span>DEV</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[220px]">
        {onToggleDevDock && (
          <DropdownMenuItem onClick={onToggleDevDock}>
            <Wrench className="mr-2 h-4 w-4" />
            Toggle Dev Dock {openDevDock ? <Check className="ml-auto h-4 w-4 opacity-70" /> : null}
          </DropdownMenuItem>
        )}
        {onToggleDevDock && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={() => { write("DEV_UI", !flags.dev); reload() }}>
          <Settings2 className="mr-2 h-4 w-4" />
          Toggle Dev UI {flags.dev && <Check className="ml-auto h-4 w-4 opacity-70" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={flags.ruleTester}
          onCheckedChange={(v) => { toggle("ruleTester", "FEATURE_RULE_TESTER")(!!v); reload() }}
        >
          Rule Tester
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={flags.mlSelftest}
          onCheckedChange={(v) => { toggle("mlSelftest", "FEATURE_ML_SELFTEST")(!!v); reload() }}
        >
          ML Selftest
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={flags.planner}
          onCheckedChange={(v) => { toggle("planner", "FEATURE_PLANNER")(!!v); reload() }}
        >
          Planner DevTool
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.open("/docs", "_blank")}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          OpenAPI /docs
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open("/", "_blank")}>
          <Rocket className="mr-2 h-4 w-4" />
          Go to app
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
