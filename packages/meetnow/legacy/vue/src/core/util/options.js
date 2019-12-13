import { LIFECYCLE_HOOKS } from '../../shared/constants';
import {
  extend,
  hasOwn,
  camelize,
  isPlainObject,
} from '../../shared/util';
import config from '../config';
import { set } from '../observer/index';
import { nativeWatch, hasSymbol } from './env';


/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
const strats = config.optionMergeStrategies;

/**
 * Helper that recursively merges two data objects together.
 */
function mergeData(to, from) {
  if (!from) return to;
  let key;

  let toVal;

  let
    fromVal;

  const keys = hasSymbol ? Reflect.ownKeys(from) : Object.keys(from);

  for (let i = 0; i < keys.length; i++) {
    key = keys[i];
    // in case the object is already observed...
    // eslint-disable-next-line no-continue
    if (key === '__ob__') continue;
    toVal = to[key];
    fromVal = from[key];
    if (!hasOwn(to, key)) {
      set(to, key, fromVal);
    }
    else if (
      toVal !== fromVal
      && isPlainObject(toVal)
      && isPlainObject(fromVal)
    ) {
      mergeData(toVal, fromVal);
    }
  }

  return to;
}

/**
 * Data
 */
export function mergeDataOrFn(
  parentVal,
  childVal,
  vm,
) {
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    if (!childVal) {
      return parentVal;
    }
    if (!parentVal) {
      return childVal;
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.

    return function mergedDataFn() {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal,
      );
    };
  }

  return function mergedInstanceDataFn() {
    // instance merge
    const instanceData = typeof childVal === 'function'
      ? childVal.call(vm, vm)
      : childVal;
    const defaultData = typeof parentVal === 'function'
      ? parentVal.call(vm, vm)
      : parentVal;

    if (instanceData) {
      return mergeData(instanceData, defaultData);
    }

    return defaultData;
  };
}

strats.data = function (
  parentVal,
  childVal,
  vm,
) {
  if (!vm) {
    if (childVal && typeof childVal !== 'function') {
      return parentVal;
    }

    return mergeDataOrFn(parentVal, childVal);
  }

  return mergeDataOrFn(parentVal, childVal, vm);
};

/**
 * Hooks and props are merged as arrays.
 */
function mergeHook(
  parentVal,
  childVal,
) {
  const res = childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal;


  return res
    ? dedupeHooks(res)
    : res;
}

function dedupeHooks(hooks) {
  const res = [];

  for (let i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i]);
    }
  }

  return res;
}

LIFECYCLE_HOOKS.forEach((hook) => {
  strats[hook] = mergeHook;
});


/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
strats.watch = function (
  parentVal,
  childVal,
) {
  // work around Firefox's Object.prototype.watch...
  if (parentVal === nativeWatch) parentVal = undefined;
  if (childVal === nativeWatch) childVal = undefined;
  /* istanbul ignore if */
  if (!childVal) return extend({}, parentVal); // Object.create(parentVal || null);
  if (!parentVal) return childVal;
  const ret = {};

  extend(ret, parentVal);
  Object.keys(childVal).forEach((key) => {
    let parent = ret[key];
    const child = childVal[key];

    if (parent && !Array.isArray(parent)) {
      parent = [parent];
    }
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child];
  });

  return ret;
};

/**
 * Other object hashes.
 */
strats.props = strats.methods = strats.inject = strats.computed = function (
  parentVal,
  childVal,
  vm,
  key,
) {
  if (!parentVal) return childVal;
  const ret = Object.create(null);

  extend(ret, parentVal);
  if (childVal) extend(ret, childVal);

  return ret;
};
strats.provide = mergeDataOrFn;

/**
 * Default strategy.
 */
const defaultStrat = function (parentVal, childVal) {
  return childVal === undefined
    ? parentVal
    : childVal;
};

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 */
function normalizeProps(options, vm) {
  const props = options.props;

  if (!props) return;
  const res = {};

  let i;

  let val;

  let
    name;

  if (Array.isArray(props)) {
    i = props.length;
    while (i--) {
      val = props[i];
      if (typeof val === 'string') {
        name = camelize(val);
        res[name] = { type: null };
      }
    }
  }
  else if (isPlainObject(props)) {
    Object.keys(props).forEach((key) => {
      val = props[key];
      name = camelize(key);
      res[name] = isPlainObject(val) ? val : { type: val };
    });
  }
  options.props = res;
}

/**
 * Normalize all injections into Object-based format
 */
function normalizeInject(options, vm) {
  const inject = options.inject;

  if (!inject) return;
  const normalized = options.inject = {};

  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] };
    }
  }
  else if (isPlainObject(inject)) {
    Object.keys(inject).forEach((key) => {
      const val = inject[key];

      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val };
    });
  }
}

/**
 * Normalize raw function directives into object format.
 */
function normalizeDirectives(options) {
  const dirs = options.directives;

  if (dirs) {
    Object.keys(dirs).forEach((key) => {
      const def = dirs[key];

      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def };
      }
    });
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */
export function mergeOptions(
  parent,
  child,
  vm,
) {
  if (typeof child === 'function') {
    child = child.options;
  }

  normalizeProps(child, vm);
  normalizeInject(child, vm);
  normalizeDirectives(child);

  // Apply extends and mixins on the child options,
  // but only if it is a raw options object that isn't
  // the result of another mergeOptions call.
  // Only merged options has the _base property.
  if (!child._base) {
    if (child.extends) {
      parent = mergeOptions(parent, child.extends, vm);
    }
    if (child.mixins) {
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm);
      }
    }
  }

  const options = {};

  Object.keys(parent).forEach((key) => mergeField(key));
  Object.keys(child).forEach((key) => !hasOwn(parent, key) && mergeField(key));

  function mergeField(key) {
    const strat = strats[key] || defaultStrat;

    options[key] = strat(parent[key], child[key], vm, key);
  }

  return options;
}