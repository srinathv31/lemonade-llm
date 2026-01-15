"use client";

import { useState, useTransition, useEffect } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createSimulation } from "@/app/actions/simulations";
import type { OllamaModel } from "@/lib/ollama";

interface CreateSimulationDialogProps {
  trigger?: React.ReactNode;
}

export function CreateSimulationDialog({
  trigger,
}: CreateSimulationDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [numDays, setNumDays] = useState(5);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("");
  const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Fetch models when dialog opens
  useEffect(() => {
    if (!open || availableModels.length > 0) return;

    let cancelled = false;

    async function fetchModels() {
      try {
        const res = await fetch("/api/ollama/models");
        const data = await res.json();
        if (!cancelled && data.models) {
          setAvailableModels(data.models);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to fetch available models");
        }
      } finally {
        if (!cancelled) {
          setLoadingModels(false);
        }
      }
    }

    fetchModels();

    return () => {
      cancelled = true;
    };
  }, [open, availableModels.length]);

  function handleAddAgent() {
    if (currentModel && !selectedModels.includes(currentModel)) {
      setSelectedModels([...selectedModels, currentModel]);
      setCurrentModel("");
    }
  }

  function handleRemoveAgent(model: string) {
    setSelectedModels(selectedModels.filter((m) => m !== model));
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError("Simulation name is required");
      return;
    }
    if (selectedModels.length === 0) {
      setError("At least one agent is required");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await createSimulation({
        name: name.trim(),
        agents: selectedModels.map((modelName) => ({ modelName })),
        config: { numDays },
      });

      if (result.success) {
        setOpen(false);
        // Reset form
        setName("");
        setNumDays(5);
        setSelectedModels([]);
        setCurrentModel("");
      } else {
        setError(result.error);
      }
    });
  }

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen);
    if (newOpen && availableModels.length === 0) {
      // Set loading state when opening with no cached models
      setLoadingModels(true);
    }
    if (!newOpen) {
      // Reset form on close
      setName("");
      setNumDays(5);
      setSelectedModels([]);
      setCurrentModel("");
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Simulation
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Simulation</DialogTitle>
          <DialogDescription>
            Set up a new lemonade stand competition between AI agents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Simulation Name */}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Simulation Name
            </label>
            <Input
              id="name"
              placeholder="My Simulation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Number of Days */}
          <div className="space-y-2">
            <label htmlFor="numDays" className="text-sm font-medium">
              Number of Days
            </label>
            <Input
              id="numDays"
              type="number"
              min={1}
              max={30}
              value={numDays}
              onChange={(e) => setNumDays(parseInt(e.target.value) || 5)}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Each day has 8 hours of simulation (9am-5pm)
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Agents</label>
            <div className="flex gap-2">
              <Select
                value={currentModel}
                onValueChange={setCurrentModel}
                disabled={isPending || loadingModels}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue
                    placeholder={
                      loadingModels ? "Loading models..." : "Select a model"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem
                      key={model.name}
                      value={model.name}
                      disabled={selectedModels.includes(model.name)}
                    >
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddAgent}
                disabled={!currentModel || isPending}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add 1-10 agents to compete
            </p>
          </div>

          {/* Selected Agents */}
          {selectedModels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedModels.map((model) => (
                <Badge key={model} variant="secondary" className="gap-1">
                  {model}
                  <button
                    type="button"
                    onClick={() => handleRemoveAgent(model)}
                    className="ml-1 hover:text-destructive"
                    disabled={isPending}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Simulation"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
