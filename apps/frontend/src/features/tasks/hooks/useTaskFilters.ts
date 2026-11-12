import { useState, useCallback, useMemo } from 'react';
import type { TaskFilterState, TaskFilterPatch } from '../types/task.types';
import {
  createDefaultTaskFilters,
  applyFilterPatch,
  computeIsFiltering,
} from '../utils/task-filter.utils';

export type { TaskFilterState, TaskFilterPatch };

export function useTaskFilters() {
  const [filters, setFilters] = useState<TaskFilterState>(createDefaultTaskFilters);

  const isFiltering = useMemo(() => computeIsFiltering(filters), [filters]);

  const updateFilters = useCallback((patch: TaskFilterPatch) => {
    setFilters((prev) => applyFilterPatch(prev, patch));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(createDefaultTaskFilters());
  }, []);

  return {
    filters,
    setFilters,
    isFiltering,
    updateFilters,
    resetFilters,
  };
}
