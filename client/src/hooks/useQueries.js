import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";

// ── Query keys ────────────────────────────────────────────────────────────────
export const keys = {
  modelStatus: ["modelStatus"],
  classes: ["classes"],
  samples: (classId) => ["samples", classId],
};

// ── Queries ───────────────────────────────────────────────────────────────────

export function useModelStatus() {
  return useQuery({
    queryKey: keys.modelStatus,
    queryFn: api.modelStatus,
    retry: false, // don't retry — server might just be offline
  });
}

export function useClasses() {
  return useQuery({
    queryKey: keys.classes,
    queryFn: api.listClasses,
  });
}

export function useSamples(classId) {
  return useQuery({
    queryKey: keys.samples(classId),
    queryFn: () => api.listSamples(classId),
    enabled: classId != null,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useAddClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }) => api.createClass(name, color),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.classes }),
  });
}

export function useDeleteClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteClass(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.classes }),
  });
}

export function useAddSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ classId, thumb }) =>
      api.createSample({ class_id: classId, thumb }),
    onSuccess: (_, { classId }) =>
      qc.invalidateQueries({ queryKey: keys.samples(classId) }),
  });
}

export function useDeleteSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sampleId, classId }) => api.deleteSample(sampleId),
    onSuccess: (_, { classId }) =>
      qc.invalidateQueries({ queryKey: keys.samples(classId) }),
  });
}

export function useClearSamples() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (classId) => api.deleteSamplesByClass(classId),
    onSuccess: (_, classId) =>
      qc.invalidateQueries({ queryKey: keys.samples(classId) }),
  });
}

export function useTrain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.train,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.modelStatus }),
  });
}
