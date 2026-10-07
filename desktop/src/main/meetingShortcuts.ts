/** Lo que se usa de globalShortcut. */
export type ShortcutRegistry = {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
};

/** Ctrl+Alt+1…9: no bloquean los números al escribir en el chat de la reunión. */
export const MEETING_ACCELERATORS = Array.from({ length: 9 }, (_, i) => `Control+Alt+${i + 1}`);

export function createMeetingShortcuts(
  registry: ShortcutRegistry,
  onPhrase: (index: number) => void,
) {
  let registered: string[] = [];
  const unregister = () => {
    registered.forEach((a) => registry.unregister(a));
    registered = [];
  };
  return {
    /** Registra los nueve atajos y devuelve los que otra app ya ocupa. */
    register(): string[] {
      unregister();
      const failed: string[] = [];
      MEETING_ACCELERATORS.forEach((accel, index) => {
        if (registry.register(accel, () => onPhrase(index))) registered.push(accel);
        else failed.push(accel);
      });
      return failed;
    },
    unregister,
  };
}
