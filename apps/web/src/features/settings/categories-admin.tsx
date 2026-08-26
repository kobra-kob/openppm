"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tags, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card, Input, Label } from "@/components/ui";
import { api } from "@/lib/api-client";

interface Category {
  id: string;
  name: string;
  color: string;
}

/** Catégories de projets : création (nom + couleur) et suppression. */
export function CategoriesAdmin() {
  const tProjects = useTranslations("projects");
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState({ name: "", color: "#0071e3" });

  const { data: categories } = useQuery({
    queryKey: ["project-categories"],
    queryFn: () => api<Category[]>("/project-categories"),
  });

  const addCategoryMutation = useMutation({
    mutationFn: () =>
      api<Category>("/project-categories", { method: "POST", body: JSON.stringify(newCategory) }),
    onSuccess: () => {
      setNewCategory({ name: "", color: "#0071e3" });
      void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => api<void>(`/project-categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2 text-muted">
        <Tags size={16} />
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          {tProjects("categories.manage")}
        </h2>
      </div>
      {(categories ?? []).length === 0 ? (
        <p className="mb-3 text-sm text-muted">{tProjects("categories.empty")}</p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {(categories ?? []).map((category) => (
            <li key={category.id} className="flex items-center gap-2 text-sm">
              <span className="size-3 rounded-full" style={{ backgroundColor: category.color }} />
              <span className="flex-1">{category.name}</span>
              <button
                type="button"
                onClick={() => deleteCategoryMutation.mutate(category.id)}
                aria-label={tProjects("form.cancel")}
                className="rounded-full p-1 text-muted transition-colors hover:bg-border-subtle hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (newCategory.name) addCategoryMutation.mutate();
        }}
        className="flex items-end gap-2"
      >
        <div className="flex-1">
          <Label htmlFor="catName">{tProjects("categories.name")}</Label>
          <Input
            id="catName"
            maxLength={60}
            required
            value={newCategory.name}
            onChange={(event) =>
              setNewCategory((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <input
          type="color"
          aria-label="couleur"
          value={newCategory.color}
          onChange={(event) =>
            setNewCategory((current) => ({ ...current, color: event.target.value }))
          }
          className="h-9 w-12 cursor-pointer rounded-(--radius-control) border border-border-subtle bg-surface-solid"
        />
        <Button type="submit" disabled={addCategoryMutation.isPending}>
          {tProjects("categories.add")}
        </Button>
      </form>
    </Card>
  );
}
