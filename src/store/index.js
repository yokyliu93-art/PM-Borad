import { create } from 'zustand';

export const useStore = create((set) => ({
  // Auth
  currentUser: null,
  currentTeamId: null,
  teams: [],

  // Active project
  activeProjectId: null,
  activeProject: null,
  projects: [],

  // Tasks
  tasks: [],
  selectedTaskId: null,

  // Commander filters
  filterPerson: 'all',
  filterMode: 'pm',

  // Tasks version (bumped on pool:published to trigger reload)
  tasksVersion: 0,

  // Boss board
  expandedProject: null,

  setCurrentUser: (user) => set({ currentUser: user }),
  setCurrentTeamId: (id) => set({ currentTeamId: id }),
  setTeams: (teams) => set({ teams }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  setActiveProject: (project) => set({ activeProject: project }),
  setProjects: (projects) => set({ projects }),
  setTasks: (tasks) => set({ tasks }),
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  setFilterPerson: (id) => set({ filterPerson: id }),
  setFilterMode: (mode) => set({ filterMode: mode }),
  setExpandedProject: (id) => set({ expandedProject: id }),
  bumpTasksVersion: () => set((s) => ({ tasksVersion: s.tasksVersion + 1 })),

  updateTask: (taskId, patch) => set((state) => ({
    tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
  })),

  updateSubtask: (taskId, subtaskId, patch) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? { ...t, subtasks: t.subtasks?.map((s) => (s.id === subtaskId ? { ...s, ...patch } : s)) }
        : t
    ),
  })),
}));
