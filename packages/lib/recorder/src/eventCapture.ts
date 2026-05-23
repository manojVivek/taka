import type { SessionEvent } from '@taka/types';
import { throttle, generateId } from '@taka/utils';

export class EventCapture {
  private isCapturing = false;
  private onEvent: (event: Omit<SessionEvent, 'id' | 'timestamp'>) => void;
  private throttledScroll: () => void;
  private throttledMouseMove: (e: MouseEvent) => void;
  private mutationObserver?: MutationObserver;

  constructor(onEvent: (event: Omit<SessionEvent, 'id' | 'timestamp'>) => void) {
    this.onEvent = onEvent;
    this.throttledScroll = throttle(this.handleScroll.bind(this), 100);
    this.throttledMouseMove = throttle(this.handleMouseMove.bind(this), 100);
  }

  start(): void {
    if (this.isCapturing) {
      return;
    }

    this.isCapturing = true;
    this.setupEventListeners();
    this.setupMutationObserver();
  }

  stop(): void {
    if (!this.isCapturing) {
      return;
    }

    this.isCapturing = false;
    this.removeEventListeners();
    
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = undefined;
    }
  }

  private setupEventListeners(): void {
    // Click events
    document.addEventListener('click', this.handleClick, { capture: true, passive: true });
    
    // Input events
    document.addEventListener('input', this.handleInput, { passive: true });
    document.addEventListener('change', this.handleChange, { passive: true });
    
    // Keyboard events
    document.addEventListener('keydown', this.handleKeyDown, { passive: true });
    
    // Scroll events (throttled)
    document.addEventListener('scroll', this.throttledScroll, { passive: true });
    window.addEventListener('scroll', this.throttledScroll, { passive: true });
    
    // Mouse events (throttled)
    document.addEventListener('mousemove', this.throttledMouseMove, { passive: true });
    
    // Focus events
    document.addEventListener('focus', this.handleFocus, { capture: true, passive: true });
    document.addEventListener('blur', this.handleBlur, { capture: true, passive: true });
    
    // Form events
    document.addEventListener('submit', this.handleSubmit, { capture: true, passive: true });
    
    // Window events
    window.addEventListener('resize', this.handleResize, { passive: true });
    window.addEventListener('popstate', this.handlePopState, { passive: true });
  }

  private removeEventListeners(): void {
    document.removeEventListener('click', this.handleClick, { capture: true });
    document.removeEventListener('input', this.handleInput);
    document.removeEventListener('change', this.handleChange);
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('scroll', this.throttledScroll);
    window.removeEventListener('scroll', this.throttledScroll);
    document.removeEventListener('mousemove', this.throttledMouseMove);
    document.removeEventListener('focus', this.handleFocus, { capture: true });
    document.removeEventListener('blur', this.handleBlur, { capture: true });
    document.removeEventListener('submit', this.handleSubmit, { capture: true });
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('popstate', this.handlePopState);
  }

  private setupMutationObserver(): void {
    this.mutationObserver = new MutationObserver(this.handleMutations.bind(this));
    
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true,
    });
  }

  private handleClick = (event: MouseEvent): void => {
    const target = this.getElementSelector(event.target as Element);
    
    this.onEvent({
      type: 'click',
      target,
      data: {
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      },
    });
  };

  private handleInput = (event: Event): void => {
    const target = event.target as HTMLInputElement;
    const selector = this.getElementSelector(target);
    
    // Don't record sensitive information
    if (this.isSensitiveInput(target)) {
      this.onEvent({
        type: 'input',
        target: selector,
        data: {
          type: target.type,
          sensitive: true,
          length: target.value.length,
        },
      });
    } else {
      this.onEvent({
        type: 'input',
        target: selector,
        data: {
          value: target.value,
          type: target.type,
        },
      });
    }
  };

  private handleChange = (event: Event): void => {
    const target = event.target as HTMLElement;
    const selector = this.getElementSelector(target);
    
    if (target instanceof HTMLSelectElement) {
      this.onEvent({
        type: 'input',
        target: selector,
        data: {
          value: target.value,
          selectedIndex: target.selectedIndex,
          type: 'select',
        },
      });
    } else if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      this.onEvent({
        type: 'input',
        target: selector,
        data: {
          checked: target.checked,
          type: 'checkbox',
        },
      });
    } else if (target instanceof HTMLInputElement && target.type === 'radio') {
      this.onEvent({
        type: 'input',
        target: selector,
        data: {
          checked: target.checked,
          value: target.value,
          type: 'radio',
        },
      });
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    // Only record special keys and shortcuts
    if (this.isSpecialKey(event)) {
      this.onEvent({
        type: 'input',
        target: this.getElementSelector(event.target as Element),
        data: {
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          type: 'keydown',
        },
      });
    }
  };

  private handleScroll = (): void => {
    this.onEvent({
      type: 'scroll',
      data: {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        documentHeight: document.documentElement.scrollHeight,
        documentWidth: document.documentElement.scrollWidth,
      },
    });
  };

  private handleMouseMove = (event: MouseEvent): void => {
    // Only record mouse moves occasionally to avoid overwhelming data
    this.onEvent({
      type: 'mousemove',
      data: {
        x: event.clientX,
        y: event.clientY,
      },
    });
  };

  private handleFocus = (event: FocusEvent): void => {
    this.onEvent({
      type: 'focus',
      target: this.getElementSelector(event.target as Element),
    });
  };

  private handleBlur = (event: FocusEvent): void => {
    this.onEvent({
      type: 'blur',
      target: this.getElementSelector(event.target as Element),
    });
  };

  private handleSubmit = (event: Event): void => {
    this.onEvent({
      type: 'submit',
      target: this.getElementSelector(event.target as Element),
    });
  };

  private handleResize = (): void => {
    this.onEvent({
      type: 'resize',
      data: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    });
  };

  private handlePopState = (event: PopStateEvent): void => {
    this.onEvent({
      type: 'navigation',
      data: {
        url: window.location.href,
        state: event.state,
      },
    });
  };

  private handleMutations = (mutations: MutationRecord[]): void => {
    // Group mutations to avoid too many events
    const significantMutations = mutations.filter(this.isSignificantMutation);
    
    if (significantMutations.length > 0) {
      this.onEvent({
        type: 'mutation',
        data: {
          mutations: significantMutations.map(mutation => ({
            type: mutation.type,
            target: this.getElementSelector(mutation.target as Element),
            addedNodes: Array.from(mutation.addedNodes).map(node => 
              node.nodeType === Node.ELEMENT_NODE ? this.getElementSelector(node as Element) : node.textContent
            ),
            removedNodes: Array.from(mutation.removedNodes).map(node =>
              node.nodeType === Node.ELEMENT_NODE ? this.getElementSelector(node as Element) : node.textContent
            ),
            attributeName: mutation.attributeName,
            oldValue: mutation.oldValue,
          })),
        },
      });
    }
  };

  private getElementSelector(element: Element): string {
    if (!element) return '';
    
    // Try to build a unique selector
    const parts: string[] = [];
    
    // Add ID if available
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Build path from element to root
    let current = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      // Add classes if available
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).slice(0, 2); // Limit to 2 classes
        if (classes.length > 0 && classes[0]) {
          selector += '.' + classes.join('.');
        }
      }
      
      // Add nth-child if needed for uniqueness
      const siblings = Array.from(current.parentNode?.children || []);
      const sameTagSiblings = siblings.filter(sibling => sibling.tagName === current.tagName);
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
      
      parts.unshift(selector);
      current = current.parentElement as Element;
    }
    
    return parts.join(' > ');
  }

  private isSensitiveInput(element: HTMLInputElement): boolean {
    const type = element.type.toLowerCase();
    const name = element.name?.toLowerCase() || '';
    const id = element.id?.toLowerCase() || '';
    const className = element.className?.toLowerCase() || '';
    
    const sensitiveTypes = ['password', 'email'];
    const sensitiveNames = ['password', 'pass', 'pwd', 'email', 'ssn', 'credit', 'card'];
    
    return sensitiveTypes.includes(type) ||
           sensitiveNames.some(sensitive => 
             name.includes(sensitive) || id.includes(sensitive) || className.includes(sensitive)
           );
  }

  private isSpecialKey(event: KeyboardEvent): boolean {
    const specialKeys = [
      'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Home', 'End', 'PageUp', 'PageDown',
    ];
    
    return specialKeys.includes(event.key) || 
           event.ctrlKey || event.metaKey || event.altKey;
  }

  private isSignificantMutation(mutation: MutationRecord): boolean {
    // Filter out insignificant mutations to reduce noise
    if (mutation.type === 'attributes') {
      const ignoredAttributes = ['style', 'class'];
      return !ignoredAttributes.includes(mutation.attributeName || '');
    }
    
    if (mutation.type === 'childList') {
      // Ignore text-only changes that are very small
      const hasSignificantChanges = 
        mutation.addedNodes.length > 0 || 
        mutation.removedNodes.length > 0;
      return hasSignificantChanges;
    }
    
    return true;
  }
}