import { useToast } from "@/hooks/use-toast";

export function useOkErrToast() {
  const { toast } = useToast();
  return {
    ok: (description: string, title = "Success") => toast({ title, description }),
    err: (description: string, title = "Something went wrong") =>
      toast({ title, description, variant: "destructive" }),
  };
}
