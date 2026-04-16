// Simplified version of the toast hook for our app
import { useState, useEffect, useCallback } from "react";

export type ToastProps = {
  id?: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  duration?: number;
};

type ToastState = {
  toasts: ToastProps[];
};

let memoryState: ToastState = { toasts: [] };
let listeners: Array<(state: ToastState) => void> = [];

function dispatch(action: (state: ToastState) => ToastState) {
  memoryState = action(memoryState);
  listeners.forEach((listener) => listener(memoryState));
}

export function toast(props: Omit<ToastProps, "id">) {
  const id = Math.random().toString(36).substring(2, 9);
  const newToast = { ...props, id };
  
  dispatch((state) => ({
    ...state,
    toasts: [...state.toasts, newToast],
  }));

  setTimeout(() => {
    dispatch((state) => ({
      ...state,
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  }, props.duration || 3000);

  return id;
}

export function useToast() {
  const [state, setState] = useState<ToastState>(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      listeners = listeners.filter((l) => l !== setState);
    };
  }, []);

  return {
    toasts: state.toasts,
    toast,
    dismiss: useCallback((id: string) => {
      dispatch((state) => ({
        ...state,
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, []),
  };
}
