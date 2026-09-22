import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';

// Hooks dùng chung, thay các fetch rời rạc ở 19 trang (có cache 5 phút).

export function useTasks(options = {}) {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.get('/tasks/'),
    ...options,
  });
}

export function useTimeline() {
  return useQuery({
    queryKey: ['timeline'],
    queryFn: () => api.get('/schedule/timeline'),
  });
}

export function useFocusSummary() {
  return useQuery({
    queryKey: ['focus-summary'],
    queryFn: () => api.get('/focus/today-summary'),
  });
}

export function usePulse() {
  return useQuery({
    queryKey: ['pulse'],
    queryFn: () => api.get('/circadian/pulse'),
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useInsights() {
  return useQuery({
    queryKey: ['insights'],
    queryFn: () => api.get('/circadian/insights'),
  });
}

export function useAnalyticsDashboard(range = 'week') {
  return useQuery({
    queryKey: ['analytics', range],
    queryFn: () => api.get(`/analytics/dashboard?range=${encodeURIComponent(range)}`),
  });
}

export function useToggleSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subtaskId) => api.patch(`/tasks/subtasks/${subtaskId}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId) => api.delete(`/tasks/${taskId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useToggleEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId) => api.patch(`/schedule/events/${eventId}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}
