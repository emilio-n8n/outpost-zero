export class Input {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly mouseButtons = new Set<number>();
  private readonly mousePressed = new Set<number>();
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private canvas: HTMLCanvasElement;
  private onLockChange: (locked: boolean) => void;
  private onCanvasClick: (() => void) | null = null;
  private enabled = true;

  constructor(canvas: HTMLCanvasElement, onLockChange: (locked: boolean) => void) {
    this.canvas = canvas;
    this.onLockChange = onLockChange;
    this.bind();
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  private bind(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('click', this.handleCanvasClick);
  }

  private handleCanvasClick = (): void => {
    this.onCanvasClick?.();
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.isTypingTarget(event.target)) return;
    if (
      event.code === 'Tab' ||
      event.code === 'Space' ||
      event.code === 'ArrowUp' ||
      event.code === 'ArrowDown'
    ) {
      event.preventDefault();
    }
    if (event.repeat) return;
    this.keys.add(event.code);
    this.pressed.add(event.code);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private handleMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement === this.canvas) {
      this.mouseDeltaX += event.movementX;
      this.mouseDeltaY += event.movementY;
    }
  };

  private handleMouseDown = (event: MouseEvent): void => {
    if (!this.enabled) return;
    if (event.target instanceof HTMLElement && event.target.closest('#ui-root')) return;
    this.mouseButtons.add(event.button);
    this.mousePressed.add(event.button);
  };

  private handleMouseUp = (event: MouseEvent): void => {
    this.mouseButtons.delete(event.button);
  };

  private handleBlur = (): void => {
    this.keys.clear();
    this.mouseButtons.clear();
  };

  private handlePointerLockChange = (): void => {
    this.onLockChange(document.pointerLockElement === this.canvas);
  };

  isDown(code: string): boolean {
    return this.enabled && this.keys.has(code);
  }

  consumePressed(code: string): boolean {
    if (!this.enabled) return false;
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  isMouseDown(button = 0): boolean {
    return this.enabled && this.mouseButtons.has(button);
  }

  consumeMousePressed(button = 0): boolean {
    if (!this.enabled) return false;
    if (!this.mousePressed.has(button)) return false;
    this.mousePressed.delete(button);
    return true;
  }

  consumeMouseDelta(): { x: number; y: number } {
    const delta = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return delta;
  }

  clearFrame(): void {
    this.pressed.clear();
    this.mousePressed.clear();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.mouseButtons.clear();
      this.pressed.clear();
      this.mousePressed.clear();
    }
  }

  isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestPointerLock(): void {
    if (document.pointerLockElement === this.canvas) return;
    try {
      const result = this.canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) {
        result.catch(() => undefined);
      }
    } catch {
      // Some browsers reject pointer lock without a direct user gesture.
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  setCanvasClickHandler(handler: (() => void) | null): void {
    this.onCanvasClick = handler;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.canvas.removeEventListener('click', this.handleCanvasClick);
  }
}
