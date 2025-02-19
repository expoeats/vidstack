/**
 * Adapted from: https://github.com/lit/lit/blob/main/packages/labs/observers/src/intersection_controller.ts
 */

import { type ReactiveController, type ReactiveControllerHost } from 'lit';

import { LogDispatcher } from '../logger';

/**
 * The callback function for a `IntersectionController`.
 */
export type IntersectionValueCallback = (
  ...args: Parameters<IntersectionObserverCallback>
) => unknown;

/**
 * The config options for a `IntersectionController`.
 */
export type IntersectionControllerConfig = {
  /**
   * The element that is used as the viewport for checking visibility of the target. Must be the
   * ancestor of the target. Defaults to the browser viewport if not specified or if `null`.
   */
  root?: Element | Document | null;

  /**
   * Margin around the root. Can have values similar to the CSS margin property, e.g.
   * "10px 20px 30px 40px" (top, right, bottom, left). The values can be percentages. This set
   * of values serves to grow or shrink each side of the root element's bounding box before
   * computing intersections. Defaults to all zeros.
   */
  rootMargin?: string;

  /**
   * Either a single number or an array of numbers which indicate at what percentage of the
   * target's visibility the observer's callback should be executed. If you only want to detect
   * when visibility passes the `50%` mark, you can use a value of `0.5`. If you want the callback
   * to run every time visibility passes another `25%`, you would specify the array
   * `[0, 0.25, 0.5, 0.75, 1]`.
   *
   * The default is `0` (meaning as soon as even one pixel is visible, the callback will be run).
   * A value of `1.0` means that the threshold isn't considered passed until every pixel is
   * visible.
   */
  threshold?: number | number[];

  /**
   * The element to observe. In addition to configuring the target here, the `observe` method
   * can be called to observe additional targets. When not specified, the target defaults to
   * the `host`. If set to `null`, no target is automatically observed. Only the configured
   * target will be re-observed if the host connects again after unobserving via disconnection.
   */
  target?: Element | null;
  /**
   * An IntersectionObserver reports the initial intersection state when observe is called.
   * Setting this flag to true skips processing this initial state for cases when this is
   * unnecessary.
   */
  skipInitial?: boolean;
};

/**
 * `IntersectionController` integrates an `IntersectionObserver` with a host element's reactive
 * update lifecycle.
 *
 * This is can be used to detect when a target element "intersects" is visible inside of) another
 * element or the viewport by default, where intersect means "visible inside of."
 *
 * The controller can specify a `target` element to observe and the configuration options to
 * pass to the `IntersectionObserver`. The `observe` method can be called to observe
 * additional elements.
 *
 * When a change is detected, the controller's given `callback` function is used to process the
 * result into a value which is stored on the controller. The controller's `value` is usable
 * during the host's update cycle.
 */
export class IntersectionController implements ReactiveController {
  protected _target: Element | null;
  protected _observer!: IntersectionObserver;
  protected _skipInitial = false;

  /**
   * Flag used to help manage calling the `callback` when observe is called and `skipInitial` is
   * set to true. Note that unlike the other observers `IntersectionObserver` *does* report its
   * initial state (e.g. whether or not there is an intersection). This flag is used to avoid
   * handling this state if `skipInitial` is true.
   */
  protected _unobservedUpdate = false;

  /**
   * The result of processing the observer's changes via the `callback` function.
   */
  value?: unknown;

  constructor(
    protected readonly _host: ReactiveControllerHost & EventTarget,
    config: IntersectionControllerConfig = {},
    protected readonly _callback: IntersectionValueCallback = () => true,
    protected readonly _logger = __DEV__ ? new LogDispatcher(_host) : undefined,
  ) {
    const { target, skipInitial, ...intersectionObserverInit } = config;

    this._target = target === null ? target : target ?? (this._host as unknown as Element);

    this._skipInitial = skipInitial ?? this._skipInitial;

    if (!window.IntersectionObserver) {
      if (__DEV__) {
        _logger?.warn(`Browser does not support \`IntersectionObserver\`.`);
      }
      return;
    }

    this._observer = new IntersectionObserver((entries: IntersectionObserverEntry[]) => {
      const unobservedUpdate = this._unobservedUpdate;
      this._unobservedUpdate = false;
      if (this._skipInitial && unobservedUpdate) return;
      this.handleChanges(entries);
      this._host.requestUpdate();
    }, intersectionObserverInit);

    _host.addController(this);
  }

  /**
   * Process the observer's changes with the controller's `callback` function to produce a
   * result stored in the `value` property.
   */
  protected handleChanges(entries: IntersectionObserverEntry[]) {
    this.value = this._callback(entries, this._observer);
  }

  hostConnected() {
    if (this._target) {
      this.observe(this._target);
    }
  }

  hostDisconnected() {
    this.disconnect();
  }

  async hostUpdated() {
    // Eagerly deliver any changes that happened during update.
    const pendingRecords = this._observer.takeRecords();
    if (pendingRecords.length) {
      this.handleChanges(pendingRecords);
    }
  }

  /**
   * Observe the target element. The controller's `target` is automatically observed when the
   * host connects.
   *
   * @param target Element to observe
   */
  observe(target: Element) {
    // This will always trigger the callback since the initial intersection state is reported.
    this._observer.observe(target);
    this._unobservedUpdate = true;
  }

  /**
   * Disconnects the observer. This is done automatically when the host disconnects.
   */
  protected disconnect() {
    this._observer.disconnect();
  }
}

export function createIntersectionController(
  ...params: ConstructorParameters<typeof IntersectionController>
) {
  return new IntersectionController(...params);
}
