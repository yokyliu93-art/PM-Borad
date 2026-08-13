import { useEffect } from 'react';
import { connect, joinProject, leaveProject, on, off } from '../lib/socket';
import { useStore } from '../store';

export function useSocket(projectId) {
  const updateTask = useStore((s) => s.updateTask);
  const setTasks = useStore((s) => s.setTasks);
  const bumpTasksVersion = useStore((s) => s.bumpTasksVersion);

  useEffect(() => {
    if (!projectId) return;

    connect();
    joinProject(projectId);

    function handleClaimed({ taskId, task }) {
      updateTask(taskId, task || {});
      bumpTasksVersion();
    }
    function handleUnclaimed({ taskId, task }) {
      updateTask(taskId, task || {});
      bumpTasksVersion();
    }
    function handleUpdated({ taskId, patch }) {
      updateTask(taskId, patch);
      bumpTasksVersion();
    }
    function handleCreated({ task }) {
      setTasks((tasks) => [...tasks, task]);
      bumpTasksVersion();
    }
    function handleDeleted({ taskId }) {
      setTasks((tasks) => tasks.filter((t) => t.id !== taskId));
      bumpTasksVersion();
    }
    function handlePoolPublished() {
      bumpTasksVersion();
    }
    function handleUpdatePosted({ taskId, update }) {
      const current = useStore.getState().tasks.find((t) => t.id === taskId);
      updateTask(taskId, { updates: [update, ...(current?.updates || [])] });
      bumpTasksVersion();
    }

    on('task:claimed', handleClaimed);
    on('task:unclaimed', handleUnclaimed);
    on('task:updated', handleUpdated);
    on('task:created', handleCreated);
    on('task:deleted', handleDeleted);
    on('pool:published', handlePoolPublished);
    on('update:posted', handleUpdatePosted);

    return () => {
      off('task:claimed', handleClaimed);
      off('task:unclaimed', handleUnclaimed);
      off('task:updated', handleUpdated);
      off('task:created', handleCreated);
      off('task:deleted', handleDeleted);
      off('pool:published', handlePoolPublished);
      off('update:posted', handleUpdatePosted);
      leaveProject(projectId);
    };
  }, [projectId]);
}
