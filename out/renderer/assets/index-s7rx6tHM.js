// node_modules/@vue/shared/dist/shared.esm-bundler.js
/**
* @vue/shared v3.5.44
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
// @__NO_SIDE_EFFECTS__
function makeMap(str) {
	const map = /* @__PURE__ */ Object.create(null);
	for (const key of str.split(",")) map[key] = 1;
	return (val) => val in map;
}
var EMPTY_OBJ = {};
var EMPTY_ARR = [];
var NOOP = () => {};
var NO = () => false;
var isOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && (key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97);
var isModelListener = (key) => key.startsWith("onUpdate:");
var extend = Object.assign;
var remove = (arr, el) => {
	const i = arr.indexOf(el);
	if (i > -1) arr.splice(i, 1);
};
var hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var hasOwn = (val, key) => hasOwnProperty$1.call(val, key);
var isArray$1 = Array.isArray;
var isMap = (val) => toTypeString(val) === "[object Map]";
var isSet = (val) => toTypeString(val) === "[object Set]";
var isDate = (val) => toTypeString(val) === "[object Date]";
var isFunction = (val) => typeof val === "function";
var isString = (val) => typeof val === "string";
var isSymbol = (val) => typeof val === "symbol";
var isObject = (val) => val !== null && typeof val === "object";
var isPromise = (val) => {
	return (isObject(val) || isFunction(val)) && isFunction(val.then) && isFunction(val.catch);
};
var objectToString = Object.prototype.toString;
var toTypeString = (value) => objectToString.call(value);
var toRawType = (value) => {
	return toTypeString(value).slice(8, -1);
};
var isPlainObject$1 = (val) => toTypeString(val) === "[object Object]";
var isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
var isReservedProp = /* @__PURE__ */ makeMap(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted");
var cacheStringFunction = (fn) => {
	const cache = /* @__PURE__ */ Object.create(null);
	return ((str) => {
		return cache[str] || (cache[str] = fn(str));
	});
};
var camelizeRE = /-\w/g;
var camelize = cacheStringFunction((str) => {
	return str.replace(camelizeRE, (c) => c.slice(1).toUpperCase());
});
var hyphenateRE = /\B([A-Z])/g;
var hyphenate = cacheStringFunction((str) => str.replace(hyphenateRE, "-$1").toLowerCase());
var capitalize = cacheStringFunction((str) => {
	return str.charAt(0).toUpperCase() + str.slice(1);
});
var toHandlerKey = cacheStringFunction((str) => {
	return str ? `on${capitalize(str)}` : ``;
});
var hasChanged = (value, oldValue) => !Object.is(value, oldValue);
var invokeArrayFns = (fns, ...arg) => {
	for (let i = 0; i < fns.length; i++) fns[i](...arg);
};
var def = (obj, key, value, writable = false) => {
	Object.defineProperty(obj, key, {
		configurable: true,
		enumerable: false,
		writable,
		value
	});
};
var looseToNumber = (val) => {
	const n = parseFloat(val);
	return isNaN(n) ? val : n;
};
var _globalThis;
var getGlobalThis = () => {
	return _globalThis || (_globalThis = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
};
function normalizeStyle(value) {
	if (isArray$1(value)) {
		const res = {};
		for (let i = 0; i < value.length; i++) {
			const item = value[i];
			const normalized = isString(item) ? parseStringStyle(item) : normalizeStyle(item);
			if (normalized) for (const key in normalized) res[key] = normalized[key];
		}
		return res;
	} else if (isString(value) || isObject(value)) return value;
}
var listDelimiterRE = /;(?![^(]*\))/g;
var propertyDelimiterRE = /:([^]+)/;
var styleCommentRE = /"(?:[^"\\]|\\[^])*"|'(?:[^'\\]|\\[^])*'|\\[^]|\/\*[^]*?\*\//g;
function parseStringStyle(cssText) {
	const ret = {};
	cssText.replace(styleCommentRE, (match) => match.startsWith("/*") ? "" : match).split(listDelimiterRE).forEach((item) => {
		if (item) {
			const tmp = item.split(propertyDelimiterRE);
			tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
		}
	});
	return ret;
}
function normalizeClass(value) {
	let res = "";
	if (isString(value)) res = value;
	else if (isArray$1(value)) for (let i = 0; i < value.length; i++) {
		const normalized = normalizeClass(value[i]);
		if (normalized) res += normalized + " ";
	}
	else if (isObject(value)) {
		for (const name in value) if (value[name]) res += name + " ";
	}
	return res.trim();
}
var isSpecialBooleanAttr = /* @__PURE__ */ makeMap(`itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,playsinline,readonly`);
function includeBooleanAttr(value) {
	return !!value || value === "";
}
function looseCompareArrays(a, b, seen) {
	if (a.length !== b.length) return false;
	let equal = true;
	for (let i = 0; equal && i < a.length; i++) equal = looseEqual(a[i], b[i], seen);
	return equal;
}
function looseCompareCollections(a, b, seen) {
	if (a.size !== b.size) return false;
	const candidates = Array.from(b);
	const matched = new Uint8Array(candidates.length);
	for (const item of a) {
		let index = -1;
		for (let i = 0; i < candidates.length; i++) if (!matched[i] && looseEqual(item, candidates[i], seen)) {
			index = i;
			break;
		}
		if (index < 0) return false;
		matched[index] = 1;
	}
	return true;
}
function looseCompareObjects(a, b, seen) {
	let aValidType = isMap(a);
	let bValidType = isMap(b);
	if (aValidType || bValidType) return aValidType && bValidType ? looseCompareCollections(a, b, seen) : false;
	aValidType = isSet(a);
	bValidType = isSet(b);
	if (aValidType || bValidType) return aValidType && bValidType ? looseCompareCollections(a, b, seen) : false;
	if (Object.keys(a).length !== Object.keys(b).length) return false;
	for (const key in a) {
		const aHasKey = a.hasOwnProperty(key);
		const bHasKey = b.hasOwnProperty(key);
		if (aHasKey && !bHasKey || !aHasKey && bHasKey || !looseEqual(a[key], b[key], seen)) return false;
	}
	return String(a) === String(b);
}
function looseCompareNested(a, b, seen, compare) {
	if (!seen) seen = [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map()];
	const [seenA, seenB] = seen;
	if (seenA.has(a) || seenB.has(b)) return seenA.get(a) === b && seenB.get(b) === a;
	seenA.set(a, b);
	seenB.set(b, a);
	const equal = compare(a, b, seen);
	seenA.delete(a);
	seenB.delete(b);
	return equal;
}
function looseEqual(a, b, seen) {
	if (a === b) return true;
	let aValidType = isDate(a);
	let bValidType = isDate(b);
	if (aValidType || bValidType) return aValidType && bValidType ? a.getTime() === b.getTime() : false;
	aValidType = isSymbol(a);
	bValidType = isSymbol(b);
	if (aValidType || bValidType) return a === b;
	aValidType = isArray$1(a);
	bValidType = isArray$1(b);
	if (aValidType || bValidType) return aValidType && bValidType ? looseCompareNested(a, b, seen, looseCompareArrays) : false;
	aValidType = isObject(a);
	bValidType = isObject(b);
	if (aValidType || bValidType) {
		if (!aValidType || !bValidType) return false;
		return looseCompareNested(a, b, seen, looseCompareObjects);
	}
	return String(a) === String(b);
}
function looseIndexOf(arr, val) {
	return arr.findIndex((item) => looseEqual(item, val));
}
var isRef$1 = (val) => {
	return !!(val && val["__v_isRef"] === true);
};
var toDisplayString = (val) => {
	return isString(val) ? val : val == null ? "" : isArray$1(val) || isObject(val) && (val.toString === objectToString || !isFunction(val.toString)) ? isRef$1(val) ? toDisplayString(val.value) : JSON.stringify(val, replacer, 2) : String(val);
};
var replacer = (_key, val) => {
	if (isRef$1(val)) return replacer(_key, val.value);
	else if (isMap(val)) return { [`Map(${val.size})`]: [...val.entries()].reduce((entries, [key, val2], i) => {
		entries[stringifySymbol(key, i) + " =>"] = val2;
		return entries;
	}, {}) };
	else if (isSet(val)) return { [`Set(${val.size})`]: [...val.values()].map((v) => stringifySymbol(v)) };
	else if (isSymbol(val)) return stringifySymbol(val);
	else if (isObject(val) && !isArray$1(val) && !isPlainObject$1(val)) return String(val);
	return val;
};
var stringifySymbol = (v, i = "") => {
	var _a;
	return isSymbol(v) ? `Symbol(${(_a = v.description) != null ? _a : i})` : v;
};
// node_modules/@vue/reactivity/dist/reactivity.esm-bundler.js
/**
* @vue/reactivity v3.5.44
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
var activeEffectScope;
var EffectScope = class {
	constructor(detached = false) {
		this.detached = detached;
		/**
		* @internal
		*/
		this._active = true;
		/**
		* @internal track `on` calls, allow `on` call multiple times
		*/
		this._on = 0;
		/**
		* @internal
		*/
		this.effects = [];
		/**
		* @internal
		*/
		this.cleanups = [];
		this._isPaused = false;
		this._warnOnRun = true;
		this.__v_skip = true;
		if (!detached && activeEffectScope) {
			if (activeEffectScope.active) {
				this.parent = activeEffectScope;
				this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(this) - 1;
			} else {
				this._active = false;
				this._warnOnRun = false;
			}
		}
	}
	get active() {
		return this._active;
	}
	pause() {
		if (this._active) {
			this._isPaused = true;
			let i, l;
			if (this.scopes) {
				const scopes = this.scopes.slice();
				for (i = 0, l = scopes.length; i < l; i++) scopes[i].pause();
			}
			for (i = 0, l = this.effects.length; i < l; i++) this.effects[i].pause();
		}
	}
	/**
	* Resumes the effect scope, including all child scopes and effects.
	*/
	resume() {
		if (this._active) {
			if (this._isPaused) {
				this._isPaused = false;
				let i, l;
				if (this.scopes) {
					const scopes = this.scopes.slice();
					for (i = 0, l = scopes.length; i < l; i++) scopes[i].resume();
				}
				const effects = this.effects.slice();
				for (i = 0, l = effects.length; i < l; i++) effects[i].resume();
			}
		}
	}
	run(fn) {
		if (this._active) {
			const currentEffectScope = activeEffectScope;
			try {
				activeEffectScope = this;
				return fn();
			} finally {
				activeEffectScope = currentEffectScope;
			}
		}
	}
	/**
	* This should only be called on non-detached scopes
	* @internal
	*/
	on() {
		if (++this._on === 1) {
			this.prevScope = activeEffectScope;
			activeEffectScope = this;
		}
	}
	/**
	* This should only be called on non-detached scopes
	* @internal
	*/
	off() {
		if (this._on > 0 && --this._on === 0) {
			if (activeEffectScope === this) activeEffectScope = this.prevScope;
			else {
				let current = activeEffectScope;
				while (current) {
					if (current.prevScope === this) {
						current.prevScope = this.prevScope;
						break;
					}
					current = current.prevScope;
				}
			}
			this.prevScope = void 0;
		}
	}
	stop(fromParent) {
		if (this._active) {
			this._active = false;
			let i, l;
			for (i = 0, l = this.effects.length; i < l; i++) this.effects[i].stop();
			this.effects.length = 0;
			for (i = 0, l = this.cleanups.length; i < l; i++) this.cleanups[i]();
			this.cleanups.length = 0;
			if (this.scopes) {
				const scopes = this.scopes.slice();
				for (i = 0, l = scopes.length; i < l; i++) scopes[i].stop(true);
				this.scopes.length = 0;
			}
			if (!this.detached && this.parent && !fromParent) {
				const last = this.parent.scopes.pop();
				if (last && last !== this) {
					this.parent.scopes[this.index] = last;
					last.index = this.index;
				}
			}
			this.parent = void 0;
		}
	}
};
function effectScope(detached) {
	return new EffectScope(detached);
}
function getCurrentScope() {
	return activeEffectScope;
}
function onScopeDispose(fn, failSilently = false) {
	if (activeEffectScope) activeEffectScope.cleanups.push(fn);
}
var activeSub;
var pausedQueueEffects = /* @__PURE__ */ new WeakSet();
var ReactiveEffect = class {
	constructor(fn) {
		this.fn = fn;
		/**
		* @internal
		*/
		this.deps = void 0;
		/**
		* @internal
		*/
		this.depsTail = void 0;
		/**
		* @internal
		*/
		this.flags = 5;
		/**
		* @internal
		*/
		this.next = void 0;
		/**
		* @internal
		*/
		this.cleanup = void 0;
		this.scheduler = void 0;
		if (activeEffectScope) {
			if (activeEffectScope.active) activeEffectScope.effects.push(this);
			else this.flags &= -2;
		}
	}
	pause() {
		this.flags |= 64;
	}
	resume() {
		if (this.flags & 64) {
			this.flags &= -65;
			if (pausedQueueEffects.has(this)) {
				pausedQueueEffects.delete(this);
				this.trigger();
			}
		}
	}
	/**
	* @internal
	*/
	notify() {
		if (this.flags & 2 && !(this.flags & 32)) return;
		if (!(this.flags & 8)) batch(this);
	}
	run() {
		if (!(this.flags & 1)) return this.fn();
		this.flags |= 2;
		cleanupEffect(this);
		prepareDeps(this);
		const prevEffect = activeSub;
		const prevShouldTrack = shouldTrack;
		activeSub = this;
		shouldTrack = true;
		try {
			return this.fn();
		} finally {
			cleanupDeps(this);
			activeSub = prevEffect;
			shouldTrack = prevShouldTrack;
			this.flags &= -3;
		}
	}
	stop() {
		if (this.flags & 1) {
			for (let link = this.deps; link; link = link.nextDep) removeSub(link);
			this.deps = this.depsTail = void 0;
			cleanupEffect(this);
			this.onStop && this.onStop();
			this.flags &= -2;
		}
	}
	trigger() {
		if (this.flags & 64) pausedQueueEffects.add(this);
		else if (this.scheduler) this.scheduler();
		else this.runIfDirty();
	}
	/**
	* @internal
	*/
	runIfDirty() {
		if (isDirty(this)) this.run();
	}
	get dirty() {
		return isDirty(this);
	}
};
var batchDepth = 0;
var batchedSub;
var batchedComputed;
function batch(sub, isComputed = false) {
	sub.flags |= 8;
	if (isComputed) {
		sub.next = batchedComputed;
		batchedComputed = sub;
		return;
	}
	sub.next = batchedSub;
	batchedSub = sub;
}
function startBatch() {
	batchDepth++;
}
function endBatch() {
	if (--batchDepth > 0) return;
	if (batchedComputed) {
		let e = batchedComputed;
		batchedComputed = void 0;
		while (e) {
			const next = e.next;
			e.next = void 0;
			e.flags &= -9;
			e = next;
		}
	}
	let error;
	while (batchedSub) {
		let e = batchedSub;
		batchedSub = void 0;
		while (e) {
			const next = e.next;
			e.next = void 0;
			e.flags &= -9;
			if (e.flags & 1) try {
				e.trigger();
			} catch (err) {
				if (!error) error = err;
			}
			e = next;
		}
	}
	if (error) throw error;
}
function prepareDeps(sub) {
	for (let link = sub.deps; link; link = link.nextDep) {
		link.version = -1;
		link.prevActiveLink = link.dep.activeLink;
		link.dep.activeLink = link;
	}
}
function cleanupDeps(sub) {
	let head;
	let tail = sub.depsTail;
	let link = tail;
	while (link) {
		const prev = link.prevDep;
		if (link.version === -1) {
			if (link === tail) tail = prev;
			removeSub(link);
			removeDep(link);
		} else head = link;
		link.dep.activeLink = link.prevActiveLink;
		link.prevActiveLink = void 0;
		link = prev;
	}
	sub.deps = head;
	sub.depsTail = tail;
}
function isDirty(sub) {
	for (let link = sub.deps; link; link = link.nextDep) if (link.dep.version !== link.version || link.dep.computed && (refreshComputed(link.dep.computed) || link.dep.version !== link.version)) return true;
	if (sub._dirty) return true;
	return false;
}
function refreshComputed(computed) {
	if (computed.flags & 4 && !(computed.flags & 16)) return;
	computed.flags &= -17;
	if (computed.globalVersion === globalVersion) return;
	computed.globalVersion = globalVersion;
	if (!computed.isSSR && computed.flags & 128 && (!computed.deps && !computed._dirty || !isDirty(computed))) return;
	computed.flags |= 2;
	const dep = computed.dep;
	const prevSub = activeSub;
	const prevShouldTrack = shouldTrack;
	activeSub = computed;
	shouldTrack = true;
	try {
		prepareDeps(computed);
		const value = computed.fn(computed._value);
		if (dep.version === 0 || hasChanged(value, computed._value)) {
			computed.flags |= 128;
			computed._value = value;
			dep.version++;
		}
	} catch (err) {
		dep.version++;
		throw err;
	} finally {
		activeSub = prevSub;
		shouldTrack = prevShouldTrack;
		cleanupDeps(computed);
		computed.flags &= -3;
	}
}
function removeSub(link, soft = false) {
	const { dep, prevSub, nextSub } = link;
	if (prevSub) {
		prevSub.nextSub = nextSub;
		link.prevSub = void 0;
	}
	if (nextSub) {
		nextSub.prevSub = prevSub;
		link.nextSub = void 0;
	}
	if (dep.subs === link) {
		dep.subs = prevSub;
		if (!prevSub && dep.computed) {
			dep.computed.flags &= -5;
			for (let l = dep.computed.deps; l; l = l.nextDep) removeSub(l, true);
		}
	}
	if (!soft && !--dep.sc && dep.map) dep.map.delete(dep.key);
}
function removeDep(link) {
	const { prevDep, nextDep } = link;
	if (prevDep) {
		prevDep.nextDep = nextDep;
		link.prevDep = void 0;
	}
	if (nextDep) {
		nextDep.prevDep = prevDep;
		link.nextDep = void 0;
	}
}
var shouldTrack = true;
var trackStack = [];
function pauseTracking() {
	trackStack.push(shouldTrack);
	shouldTrack = false;
}
function resetTracking() {
	const last = trackStack.pop();
	shouldTrack = last === void 0 ? true : last;
}
function cleanupEffect(e) {
	const { cleanup } = e;
	e.cleanup = void 0;
	if (cleanup) {
		const prevSub = activeSub;
		activeSub = void 0;
		try {
			cleanup();
		} finally {
			activeSub = prevSub;
		}
	}
}
var globalVersion = 0;
var Link = class {
	constructor(sub, dep) {
		this.sub = sub;
		this.dep = dep;
		this.version = dep.version;
		this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
	}
};
var Dep = class {
	constructor(computed) {
		this.computed = computed;
		this.version = 0;
		/**
		* Link between this dep and the current active effect
		*/
		this.activeLink = void 0;
		/**
		* Doubly linked list representing the subscribing effects (tail)
		*/
		this.subs = void 0;
		/**
		* For object property deps cleanup
		*/
		this.map = void 0;
		this.key = void 0;
		/**
		* Subscriber counter
		*/
		this.sc = 0;
		/**
		* @internal
		*/
		this.__v_skip = true;
	}
	track(debugInfo) {
		if (!activeSub || !shouldTrack || activeSub === this.computed) return;
		let link = this.activeLink;
		if (link === void 0 || link.sub !== activeSub) {
			link = this.activeLink = new Link(activeSub, this);
			if (!activeSub.deps) activeSub.deps = activeSub.depsTail = link;
			else {
				link.prevDep = activeSub.depsTail;
				activeSub.depsTail.nextDep = link;
				activeSub.depsTail = link;
			}
			addSub(link);
		} else if (link.version === -1) {
			link.version = this.version;
			if (link.nextDep) {
				const next = link.nextDep;
				next.prevDep = link.prevDep;
				if (link.prevDep) link.prevDep.nextDep = next;
				link.prevDep = activeSub.depsTail;
				link.nextDep = void 0;
				activeSub.depsTail.nextDep = link;
				activeSub.depsTail = link;
				if (activeSub.deps === link) activeSub.deps = next;
			}
		}
		return link;
	}
	trigger(debugInfo) {
		this.version++;
		globalVersion++;
		this.notify(debugInfo);
	}
	notify(debugInfo) {
		startBatch();
		try {
			for (let link = this.subs; link; link = link.prevSub) if (link.sub.notify()) link.sub.dep.notify();
		} finally {
			endBatch();
		}
	}
};
function addSub(link) {
	link.dep.sc++;
	if (link.sub.flags & 4) {
		const computed = link.dep.computed;
		if (computed && !link.dep.subs) {
			computed.flags |= 20;
			for (let l = computed.deps; l; l = l.nextDep) addSub(l);
		}
		const currentTail = link.dep.subs;
		if (currentTail !== link) {
			link.prevSub = currentTail;
			if (currentTail) currentTail.nextSub = link;
		}
		link.dep.subs = link;
	}
}
var targetMap = /* @__PURE__ */ new WeakMap();
var ITERATE_KEY = /* @__PURE__ */ Symbol("");
var MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol("");
var ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol("");
function track(target, type, key) {
	if (shouldTrack && activeSub) {
		let depsMap = targetMap.get(target);
		if (!depsMap) targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
		let dep = depsMap.get(key);
		if (!dep) {
			depsMap.set(key, dep = new Dep());
			dep.map = depsMap;
			dep.key = key;
		}
		dep.track();
	}
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
	const depsMap = targetMap.get(target);
	if (!depsMap) {
		globalVersion++;
		return;
	}
	const run = (dep) => {
		if (dep) dep.trigger();
	};
	startBatch();
	if (type === "clear") depsMap.forEach(run);
	else {
		const targetIsArray = isArray$1(target);
		const isArrayIndex = targetIsArray && isIntegerKey(key);
		if (targetIsArray && key === "length") {
			const newLength = Number(newValue);
			depsMap.forEach((dep, key2) => {
				if (key2 === "length" || key2 === ARRAY_ITERATE_KEY || !isSymbol(key2) && key2 >= newLength) run(dep);
			});
		} else {
			if (key !== void 0 || depsMap.has(void 0)) run(depsMap.get(key));
			if (isArrayIndex) run(depsMap.get(ARRAY_ITERATE_KEY));
			switch (type) {
				case "add":
					if (!targetIsArray) {
						run(depsMap.get(ITERATE_KEY));
						if (isMap(target)) run(depsMap.get(MAP_KEY_ITERATE_KEY));
					} else if (isArrayIndex) run(depsMap.get("length"));
					break;
				case "delete":
					if (!targetIsArray) {
						run(depsMap.get(ITERATE_KEY));
						if (isMap(target)) run(depsMap.get(MAP_KEY_ITERATE_KEY));
					}
					break;
				case "set": if (isMap(target)) run(depsMap.get(ITERATE_KEY));
			}
		}
	}
	endBatch();
}
function getDepFromReactive(object, key) {
	const depMap = targetMap.get(object);
	return depMap && depMap.get(key);
}
function reactiveReadArray(array) {
	const raw = /* @__PURE__ */ toRaw(array);
	if (raw === array) return raw;
	track(raw, "iterate", ARRAY_ITERATE_KEY);
	if (/* @__PURE__ */ isShallow(array)) return raw;
	if (!/* @__PURE__ */ isReadonly(array)) return raw.map(toReactive);
	return /* @__PURE__ */ isReactive(array) ? raw.map((item) => toReadonly(toReactive(item))) : raw.map(toReadonly);
}
function shallowReadArray(arr) {
	track(arr = /* @__PURE__ */ toRaw(arr), "iterate", ARRAY_ITERATE_KEY);
	return arr;
}
function toWrapped(target, item) {
	if (/* @__PURE__ */ isReadonly(target)) return /* @__PURE__ */ isReactive(target) ? toReadonly(toReactive(item)) : toReadonly(item);
	return toReactive(item);
}
var arrayInstrumentations = {
	__proto__: null,
	[Symbol.iterator]() {
		return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
	},
	concat(...args) {
		return reactiveReadArray(this).concat(...args.map((x) => isArray$1(x) ? reactiveReadArray(x) : x));
	},
	entries() {
		return iterator(this, "entries", (value) => {
			value[1] = toWrapped(this, value[1]);
			return value;
		});
	},
	every(fn, thisArg) {
		return apply(this, "every", fn, thisArg, void 0, arguments);
	},
	filter(fn, thisArg) {
		return apply(this, "filter", fn, thisArg, (v) => v.map((item) => toWrapped(this, item)), arguments);
	},
	find(fn, thisArg) {
		return apply(this, "find", fn, thisArg, (item) => toWrapped(this, item), arguments);
	},
	findIndex(fn, thisArg) {
		return apply(this, "findIndex", fn, thisArg, void 0, arguments);
	},
	findLast(fn, thisArg) {
		return apply(this, "findLast", fn, thisArg, (item) => toWrapped(this, item), arguments);
	},
	findLastIndex(fn, thisArg) {
		return apply(this, "findLastIndex", fn, thisArg, void 0, arguments);
	},
	forEach(fn, thisArg) {
		return apply(this, "forEach", fn, thisArg, void 0, arguments);
	},
	includes(...args) {
		return searchProxy(this, "includes", args);
	},
	indexOf(...args) {
		return searchProxy(this, "indexOf", args);
	},
	join(separator) {
		return reactiveReadArray(this).join(separator);
	},
	lastIndexOf(...args) {
		return searchProxy(this, "lastIndexOf", args);
	},
	map(fn, thisArg) {
		return apply(this, "map", fn, thisArg, void 0, arguments);
	},
	pop() {
		return noTracking(this, "pop");
	},
	push(...args) {
		return noTracking(this, "push", args);
	},
	reduce(fn, ...args) {
		return reduce(this, "reduce", fn, args);
	},
	reduceRight(fn, ...args) {
		return reduce(this, "reduceRight", fn, args);
	},
	shift() {
		return noTracking(this, "shift");
	},
	some(fn, thisArg) {
		return apply(this, "some", fn, thisArg, void 0, arguments);
	},
	splice(...args) {
		return noTracking(this, "splice", args);
	},
	toReversed() {
		return reactiveReadArray(this).toReversed();
	},
	toSorted(comparer) {
		return reactiveReadArray(this).toSorted(comparer);
	},
	toSpliced(...args) {
		return reactiveReadArray(this).toSpliced(...args);
	},
	unshift(...args) {
		return noTracking(this, "unshift", args);
	},
	values() {
		return iterator(this, "values", (item) => toWrapped(this, item));
	}
};
function iterator(self, method, wrapValue) {
	const arr = shallowReadArray(self);
	const methodFn = arr[method];
	const iter = methodFn.call(arr);
	if (arr !== self && !/* @__PURE__ */ isShallow(self)) {
		if (iter[Symbol.toStringTag] === "Array Iterator") {
			const wrapped = Object.create(Object.getPrototypeOf(iter));
			wrapped.next = () => wrapResult(iter.next(), wrapValue);
			if (methodFn !== arrayProto[method]) Object.defineProperties(wrapped, {
				return: { get() {
					const fn = iter.return;
					return typeof fn === "function" ? fn.bind(iter) : fn;
				} },
				throw: { get() {
					const fn = iter.throw;
					return typeof fn === "function" ? fn.bind(iter) : fn;
				} }
			});
			return wrapped;
		}
		iter._next = iter.next;
		iter.next = () => wrapResult(iter._next(), wrapValue);
	}
	return iter;
}
function wrapResult(result, wrapValue) {
	if (!result.done) result.value = wrapValue(result.value);
	return result;
}
var arrayProto = Array.prototype;
function apply(self, method, fn, thisArg, wrappedRetFn, args) {
	const arr = shallowReadArray(self);
	const needsWrap = arr !== self && !/* @__PURE__ */ isShallow(self);
	const methodFn = arr[method];
	if (methodFn !== arrayProto[method]) {
		const result2 = methodFn.apply(self, args);
		return needsWrap ? toReactive(result2) : result2;
	}
	let wrappedFn = fn;
	if (arr !== self) {
		if (needsWrap) wrappedFn = function(item, index) {
			return fn.call(this, toWrapped(self, item), index, self);
		};
		else if (fn.length > 2) wrappedFn = function(item, index) {
			return fn.call(this, item, index, self);
		};
	}
	const result = methodFn.call(arr, wrappedFn, thisArg);
	return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
}
function reduce(self, method, fn, args) {
	const arr = shallowReadArray(self);
	const needsWrap = arr !== self && !/* @__PURE__ */ isShallow(self);
	let wrappedFn = fn;
	let wrapInitialAccumulator = false;
	if (arr !== self) {
		if (needsWrap) {
			wrapInitialAccumulator = args.length === 0;
			wrappedFn = function(acc, item, index) {
				if (wrapInitialAccumulator) {
					wrapInitialAccumulator = false;
					acc = toWrapped(self, acc);
				}
				return fn.call(this, acc, toWrapped(self, item), index, self);
			};
		} else if (fn.length > 3) wrappedFn = function(acc, item, index) {
			return fn.call(this, acc, item, index, self);
		};
	}
	const result = arr[method](wrappedFn, ...args);
	return wrapInitialAccumulator ? toWrapped(self, result) : result;
}
function searchProxy(self, method, args) {
	const arr = /* @__PURE__ */ toRaw(self);
	track(arr, "iterate", ARRAY_ITERATE_KEY);
	const res = arr[method](...args);
	if ((res === -1 || res === false) && /* @__PURE__ */ isProxy(args[0])) {
		args[0] = /* @__PURE__ */ toRaw(args[0]);
		return arr[method](...args);
	}
	return res;
}
function noTracking(self, method, args = []) {
	pauseTracking();
	startBatch();
	const res = (/* @__PURE__ */ toRaw(self))[method].apply(self, args);
	endBatch();
	resetTracking();
	return res;
}
var isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
var builtInSymbols = new Set(/* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((key) => key !== "arguments" && key !== "caller").map((key) => Symbol[key]).filter(isSymbol));
function hasOwnProperty(key) {
	if (!isSymbol(key)) key = String(key);
	const obj = /* @__PURE__ */ toRaw(this);
	track(obj, "has", key);
	return obj.hasOwnProperty(key);
}
var BaseReactiveHandler = class {
	constructor(_isReadonly = false, _isShallow = false) {
		this._isReadonly = _isReadonly;
		this._isShallow = _isShallow;
	}
	get(target, key, receiver) {
		if (key === "__v_skip") return target["__v_skip"];
		const isReadonly2 = this._isReadonly, isShallow2 = this._isShallow;
		if (key === "__v_isReactive") return !isReadonly2;
		else if (key === "__v_isReadonly") return isReadonly2;
		else if (key === "__v_isShallow") return isShallow2;
		else if (key === "__v_raw") {
			if (receiver === (isReadonly2 ? isShallow2 ? shallowReadonlyMap : readonlyMap : isShallow2 ? shallowReactiveMap : reactiveMap).get(target) || Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)) return target;
			return;
		}
		const targetIsArray = isArray$1(target);
		if (!isReadonly2) {
			let fn;
			if (targetIsArray && (fn = arrayInstrumentations[key])) return fn;
			if (key === "hasOwnProperty") return hasOwnProperty;
		}
		const res = Reflect.get(target, key, /* @__PURE__ */ isRef(target) ? target : receiver);
		if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) return res;
		if (!isReadonly2) track(target, "get", key);
		if (isShallow2) return res;
		if (/* @__PURE__ */ isRef(res)) {
			const value = targetIsArray && isIntegerKey(key) ? res : res.value;
			return isReadonly2 && isObject(value) ? /* @__PURE__ */ readonly(value) : value;
		}
		if (isObject(res)) return isReadonly2 ? /* @__PURE__ */ readonly(res) : /* @__PURE__ */ reactive(res);
		return res;
	}
};
var MutableReactiveHandler = class extends BaseReactiveHandler {
	constructor(isShallow2 = false) {
		super(false, isShallow2);
	}
	set(target, key, value, receiver) {
		let oldValue = target[key];
		const isArrayWithIntegerKey = isArray$1(target) && isIntegerKey(key);
		if (!this._isShallow) {
			const isOldValueReadonly = /* @__PURE__ */ isReadonly(oldValue);
			if (!/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
				oldValue = /* @__PURE__ */ toRaw(oldValue);
				value = /* @__PURE__ */ toRaw(value);
			}
			if (!isArrayWithIntegerKey && /* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
				if (isOldValueReadonly) return true;
				else {
					oldValue.value = value;
					return true;
				}
			}
		}
		const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
		const result = Reflect.set(target, key, value, /* @__PURE__ */ isRef(target) ? target : receiver);
		if (target === /* @__PURE__ */ toRaw(receiver) && result) {
			if (!hadKey) trigger(target, "add", key, value);
			else if (hasChanged(value, oldValue)) trigger(target, "set", key, value, oldValue);
		}
		return result;
	}
	deleteProperty(target, key) {
		const hadKey = hasOwn(target, key);
		const oldValue = target[key];
		const result = Reflect.deleteProperty(target, key);
		if (result && hadKey) trigger(target, "delete", key, void 0, oldValue);
		return result;
	}
	has(target, key) {
		const result = Reflect.has(target, key);
		if (!isSymbol(key) || !builtInSymbols.has(key)) track(target, "has", key);
		return result;
	}
	ownKeys(target) {
		track(target, "iterate", isArray$1(target) ? "length" : ITERATE_KEY);
		return Reflect.ownKeys(target);
	}
};
var ReadonlyReactiveHandler = class extends BaseReactiveHandler {
	constructor(isShallow2 = false) {
		super(true, isShallow2);
	}
	set(target, key) {
		return true;
	}
	deleteProperty(target, key) {
		return true;
	}
};
var mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler();
var readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler();
var shallowReactiveHandlers = /* @__PURE__ */ new MutableReactiveHandler(true);
var toShallow = (value) => value;
var getProto = (v) => Reflect.getPrototypeOf(v);
function createIterableMethod(method, isReadonly2, isShallow2) {
	return function(...args) {
		const target = this["__v_raw"];
		const rawTarget = /* @__PURE__ */ toRaw(target);
		const targetIsMap = isMap(rawTarget);
		const isPair = method === "entries" || method === Symbol.iterator && targetIsMap;
		const isKeyOnly = method === "keys" && targetIsMap;
		const innerIterator = target[method](...args);
		const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive;
		!isReadonly2 && track(rawTarget, "iterate", isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
		return extend(Object.create(innerIterator), { next() {
			const { value, done } = innerIterator.next();
			return done ? {
				value,
				done
			} : {
				value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
				done
			};
		} });
	};
}
function createReadonlyMethod(type) {
	return function(...args) {
		return type === "delete" ? false : type === "clear" ? void 0 : this;
	};
}
function createInstrumentations(readonly, shallow) {
	const instrumentations = {
		get(key) {
			const target = this["__v_raw"];
			const rawTarget = /* @__PURE__ */ toRaw(target);
			const rawKey = /* @__PURE__ */ toRaw(key);
			if (!readonly) {
				if (hasChanged(key, rawKey)) track(rawTarget, "get", key);
				track(rawTarget, "get", rawKey);
			}
			const { has } = getProto(rawTarget);
			const wrap = shallow ? toShallow : readonly ? toReadonly : toReactive;
			if (has.call(rawTarget, key)) return wrap(target.get(key));
			else if (has.call(rawTarget, rawKey)) return wrap(target.get(rawKey));
			else if (target !== rawTarget) target.get(key);
		},
		get size() {
			const target = this["__v_raw"];
			!readonly && track(/* @__PURE__ */ toRaw(target), "iterate", ITERATE_KEY);
			return target.size;
		},
		has(key) {
			const target = this["__v_raw"];
			const rawTarget = /* @__PURE__ */ toRaw(target);
			const rawKey = /* @__PURE__ */ toRaw(key);
			if (!readonly) {
				if (hasChanged(key, rawKey)) track(rawTarget, "has", key);
				track(rawTarget, "has", rawKey);
			}
			return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
		},
		forEach(callback, thisArg) {
			const observed = this;
			const target = observed["__v_raw"];
			const rawTarget = /* @__PURE__ */ toRaw(target);
			const wrap = shallow ? toShallow : readonly ? toReadonly : toReactive;
			!readonly && track(rawTarget, "iterate", ITERATE_KEY);
			return target.forEach((value, key) => {
				return callback.call(thisArg, wrap(value), wrap(key), observed);
			});
		}
	};
	extend(instrumentations, readonly ? {
		add: createReadonlyMethod("add"),
		set: createReadonlyMethod("set"),
		delete: createReadonlyMethod("delete"),
		clear: createReadonlyMethod("clear")
	} : {
		add(value) {
			const target = /* @__PURE__ */ toRaw(this);
			const proto = getProto(target);
			const rawValue = /* @__PURE__ */ toRaw(value);
			const valueToAdd = !shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value) ? rawValue : value;
			if (!(proto.has.call(target, valueToAdd) || hasChanged(value, valueToAdd) && proto.has.call(target, value) || hasChanged(rawValue, valueToAdd) && proto.has.call(target, rawValue))) {
				target.add(valueToAdd);
				trigger(target, "add", valueToAdd, valueToAdd);
			}
			return this;
		},
		set(key, value) {
			if (!shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) value = /* @__PURE__ */ toRaw(value);
			const target = /* @__PURE__ */ toRaw(this);
			const { has, get } = getProto(target);
			let hadKey = has.call(target, key);
			if (!hadKey) {
				key = /* @__PURE__ */ toRaw(key);
				hadKey = has.call(target, key);
			}
			const oldValue = get.call(target, key);
			target.set(key, value);
			if (!hadKey) trigger(target, "add", key, value);
			else if (hasChanged(value, oldValue)) trigger(target, "set", key, value, oldValue);
			return this;
		},
		delete(key) {
			const target = /* @__PURE__ */ toRaw(this);
			const { has, get } = getProto(target);
			let hadKey = has.call(target, key);
			if (!hadKey) {
				key = /* @__PURE__ */ toRaw(key);
				hadKey = has.call(target, key);
			}
			const oldValue = get ? get.call(target, key) : void 0;
			const result = target.delete(key);
			if (hadKey) trigger(target, "delete", key, void 0, oldValue);
			return result;
		},
		clear() {
			const target = /* @__PURE__ */ toRaw(this);
			const hadItems = target.size !== 0;
			const oldTarget = void 0;
			const result = target.clear();
			if (hadItems) trigger(target, "clear", void 0, void 0, oldTarget);
			return result;
		}
	});
	[
		"keys",
		"values",
		"entries",
		Symbol.iterator
	].forEach((method) => {
		instrumentations[method] = createIterableMethod(method, readonly, shallow);
	});
	return instrumentations;
}
function createInstrumentationGetter(isReadonly2, shallow) {
	const instrumentations = createInstrumentations(isReadonly2, shallow);
	return (target, key, receiver) => {
		if (key === "__v_isReactive") return !isReadonly2;
		else if (key === "__v_isReadonly") return isReadonly2;
		else if (key === "__v_isShallow") return shallow;
		else if (key === "__v_raw") return target;
		return Reflect.get(hasOwn(instrumentations, key) && key in target ? instrumentations : target, key, receiver);
	};
}
var mutableCollectionHandlers = { get: /* @__PURE__ */ createInstrumentationGetter(false, false) };
var shallowCollectionHandlers = { get: /* @__PURE__ */ createInstrumentationGetter(false, true) };
var readonlyCollectionHandlers = { get: /* @__PURE__ */ createInstrumentationGetter(true, false) };
var reactiveMap = /* @__PURE__ */ new WeakMap();
var shallowReactiveMap = /* @__PURE__ */ new WeakMap();
var readonlyMap = /* @__PURE__ */ new WeakMap();
var shallowReadonlyMap = /* @__PURE__ */ new WeakMap();
function targetTypeMap(rawType) {
	switch (rawType) {
		case "Object":
		case "Array": return 1;
		case "Map":
		case "Set":
		case "WeakMap":
		case "WeakSet": return 2;
		default: return 0;
	}
}
// @__NO_SIDE_EFFECTS__
function reactive(target) {
	if (/* @__PURE__ */ isReadonly(target)) return target;
	return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers, reactiveMap);
}
// @__NO_SIDE_EFFECTS__
function shallowReactive(target) {
	return createReactiveObject(target, false, shallowReactiveHandlers, shallowCollectionHandlers, shallowReactiveMap);
}
// @__NO_SIDE_EFFECTS__
function readonly(target) {
	return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers, readonlyMap);
}
function createReactiveObject(target, isReadonly2, baseHandlers, collectionHandlers, proxyMap) {
	if (!isObject(target)) return target;
	if (target["__v_raw"] && !(isReadonly2 && target["__v_isReactive"])) return target;
	if (target["__v_skip"] || !Object.isExtensible(target)) return target;
	const existingProxy = proxyMap.get(target);
	if (existingProxy) return existingProxy;
	const targetType = targetTypeMap(toRawType(target));
	if (targetType === 0) return target;
	const proxy = new Proxy(target, targetType === 2 ? collectionHandlers : baseHandlers);
	proxyMap.set(target, proxy);
	return proxy;
}
// @__NO_SIDE_EFFECTS__
function isReactive(value) {
	if (/* @__PURE__ */ isReadonly(value)) return /* @__PURE__ */ isReactive(value["__v_raw"]);
	return !!(value && value["__v_isReactive"]);
}
// @__NO_SIDE_EFFECTS__
function isReadonly(value) {
	return !!(value && value["__v_isReadonly"]);
}
// @__NO_SIDE_EFFECTS__
function isShallow(value) {
	return !!(value && value["__v_isShallow"]);
}
// @__NO_SIDE_EFFECTS__
function isProxy(value) {
	return value ? !!value["__v_raw"] : false;
}
// @__NO_SIDE_EFFECTS__
function toRaw(observed) {
	const raw = observed && observed["__v_raw"];
	return raw ? /* @__PURE__ */ toRaw(raw) : observed;
}
function markRaw(value) {
	if (!hasOwn(value, "__v_skip") && Object.isExtensible(value)) def(value, "__v_skip", true);
	return value;
}
var toReactive = (value) => isObject(value) ? /* @__PURE__ */ reactive(value) : value;
var toReadonly = (value) => isObject(value) ? /* @__PURE__ */ readonly(value) : value;
// @__NO_SIDE_EFFECTS__
function isRef(r) {
	return r ? r["__v_isRef"] === true : false;
}
// @__NO_SIDE_EFFECTS__
function ref(value) {
	return createRef(value, false);
}
// @__NO_SIDE_EFFECTS__
function shallowRef(value) {
	return createRef(value, true);
}
function createRef(rawValue, shallow) {
	if (/* @__PURE__ */ isRef(rawValue)) return rawValue;
	return new RefImpl(rawValue, shallow);
}
var RefImpl = class {
	constructor(value, isShallow2) {
		this.dep = new Dep();
		this["__v_isRef"] = true;
		this["__v_isShallow"] = false;
		this._rawValue = isShallow2 ? value : /* @__PURE__ */ toRaw(value);
		this._value = isShallow2 ? value : toReactive(value);
		this["__v_isShallow"] = isShallow2;
	}
	get value() {
		this.dep.track();
		return this._value;
	}
	set value(newValue) {
		const oldValue = this._rawValue;
		const useDirectValue = this["__v_isShallow"] || /* @__PURE__ */ isShallow(newValue) || /* @__PURE__ */ isReadonly(newValue);
		newValue = useDirectValue ? newValue : /* @__PURE__ */ toRaw(newValue);
		if (hasChanged(newValue, oldValue)) {
			this._rawValue = newValue;
			this._value = useDirectValue ? newValue : toReactive(newValue);
			this.dep.trigger();
		}
	}
};
function triggerRef(ref2) {
	if (ref2.dep) ref2.dep.trigger();
}
function unref(ref2) {
	return /* @__PURE__ */ isRef(ref2) ? ref2.value : ref2;
}
var shallowUnwrapHandlers = {
	get: (target, key, receiver) => key === "__v_raw" ? target : unref(Reflect.get(target, key, receiver)),
	set: (target, key, value, receiver) => {
		const oldValue = target[key];
		if (/* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
			oldValue.value = value;
			return true;
		} else return Reflect.set(target, key, value, receiver);
	}
};
function proxyRefs(objectWithRefs) {
	return /* @__PURE__ */ isReactive(objectWithRefs) ? objectWithRefs : new Proxy(objectWithRefs, shallowUnwrapHandlers);
}
// @__NO_SIDE_EFFECTS__
function toRefs(object) {
	const ret = isArray$1(object) ? new Array(object.length) : {};
	for (const key in object) ret[key] = propertyToRef(object, key);
	return ret;
}
var ObjectRefImpl = class {
	constructor(_object, key, _defaultValue) {
		this._object = _object;
		this._defaultValue = _defaultValue;
		this["__v_isRef"] = true;
		this._value = void 0;
		this._key = isSymbol(key) ? key : String(key);
		this._raw = /* @__PURE__ */ toRaw(_object);
		let shallow = true;
		let obj = _object;
		if (!isArray$1(_object) || isSymbol(this._key) || !isIntegerKey(this._key)) do
			shallow = !/* @__PURE__ */ isProxy(obj) || /* @__PURE__ */ isShallow(obj);
		while (shallow && (obj = obj["__v_raw"]));
		this._shallow = shallow;
	}
	get value() {
		let val = this._object[this._key];
		if (this._shallow) val = unref(val);
		return this._value = val === void 0 ? this._defaultValue : val;
	}
	set value(newVal) {
		if (this._shallow && /* @__PURE__ */ isRef(this._raw[this._key])) {
			const nestedRef = this._object[this._key];
			if (/* @__PURE__ */ isRef(nestedRef)) {
				nestedRef.value = newVal;
				return;
			}
		}
		this._object[this._key] = newVal;
	}
	get dep() {
		return getDepFromReactive(this._raw, this._key);
	}
};
function propertyToRef(source, key, defaultValue) {
	return new ObjectRefImpl(source, key, defaultValue);
}
var ComputedRefImpl = class {
	constructor(fn, setter, isSSR) {
		this.fn = fn;
		this.setter = setter;
		/**
		* @internal
		*/
		this._value = void 0;
		/**
		* @internal
		*/
		this.dep = new Dep(this);
		/**
		* @internal
		*/
		this.__v_isRef = true;
		/**
		* @internal
		*/
		this.deps = void 0;
		/**
		* @internal
		*/
		this.depsTail = void 0;
		/**
		* @internal
		*/
		this.flags = 16;
		/**
		* @internal
		*/
		this.globalVersion = globalVersion - 1;
		/**
		* @internal
		*/
		this.next = void 0;
		this.effect = this;
		this["__v_isReadonly"] = !setter;
		this.isSSR = isSSR;
	}
	/**
	* @internal
	*/
	notify() {
		this.flags |= 16;
		if (!(this.flags & 8) && activeSub !== this) {
			batch(this, true);
			return true;
		}
	}
	get value() {
		const link = this.dep.track();
		refreshComputed(this);
		if (link) link.version = this.dep.version;
		return this._value;
	}
	set value(newValue) {
		if (this.setter) this.setter(newValue);
	}
};
// @__NO_SIDE_EFFECTS__
function computed$1(getterOrOptions, debugOptions, isSSR = false) {
	let getter;
	let setter;
	if (isFunction(getterOrOptions)) getter = getterOrOptions;
	else {
		getter = getterOrOptions.get;
		setter = getterOrOptions.set;
	}
	return new ComputedRefImpl(getter, setter, isSSR);
}
var INITIAL_WATCHER_VALUE = {};
var cleanupMap = /* @__PURE__ */ new WeakMap();
var activeWatcher = void 0;
function onWatcherCleanup(cleanupFn, failSilently = false, owner = activeWatcher) {
	if (owner) {
		let cleanups = cleanupMap.get(owner);
		if (!cleanups) cleanupMap.set(owner, cleanups = []);
		cleanups.push(cleanupFn);
	}
}
function watch$1(source, cb, options = EMPTY_OBJ) {
	const { immediate, deep, once, scheduler, augmentJob, call } = options;
	const reactiveGetter = (source2) => {
		if (deep) return source2;
		if (/* @__PURE__ */ isShallow(source2) || deep === false || deep === 0) return traverse(source2, 1);
		return traverse(source2);
	};
	let effect;
	let getter;
	let cleanup;
	let boundCleanup;
	let forceTrigger = false;
	let isMultiSource = false;
	if (/* @__PURE__ */ isRef(source)) {
		getter = () => source.value;
		forceTrigger = /* @__PURE__ */ isShallow(source);
	} else if (/* @__PURE__ */ isReactive(source)) {
		getter = () => reactiveGetter(source);
		forceTrigger = true;
	} else if (isArray$1(source)) {
		isMultiSource = true;
		forceTrigger = source.some((s) => /* @__PURE__ */ isReactive(s) || /* @__PURE__ */ isShallow(s));
		getter = () => source.map((s) => {
			if (/* @__PURE__ */ isRef(s)) return s.value;
			else if (/* @__PURE__ */ isReactive(s)) return reactiveGetter(s);
			else if (isFunction(s)) return call ? call(s, 2) : s();
		});
	} else if (isFunction(source)) {
		if (cb) getter = call ? () => call(source, 2) : source;
		else getter = () => {
			if (cleanup) {
				pauseTracking();
				try {
					cleanup();
				} finally {
					resetTracking();
				}
			}
			const currentEffect = activeWatcher;
			activeWatcher = effect;
			try {
				return call ? call(source, 3, [boundCleanup]) : source(boundCleanup);
			} finally {
				activeWatcher = currentEffect;
			}
		};
	} else getter = NOOP;
	if (cb && deep) {
		const baseGetter = getter;
		const depth = deep === true ? Infinity : deep;
		getter = () => traverse(baseGetter(), depth);
	}
	const scope = getCurrentScope();
	const watchHandle = () => {
		effect.stop();
		if (scope && scope.active) remove(scope.effects, effect);
	};
	if (once && cb) {
		const _cb = cb;
		cb = (...args) => {
			try {
				return _cb(...args);
			} finally {
				watchHandle();
			}
		};
	}
	let oldValue = isMultiSource ? new Array(source.length).fill(INITIAL_WATCHER_VALUE) : INITIAL_WATCHER_VALUE;
	const job = (immediateFirstRun) => {
		if (!(effect.flags & 1) || !effect.dirty && !immediateFirstRun) return;
		if (cb) {
			const newValue = effect.run();
			if (immediateFirstRun || deep || forceTrigger || (isMultiSource ? newValue.some((v, i) => hasChanged(v, oldValue[i])) : hasChanged(newValue, oldValue))) {
				const currentWatcher = activeWatcher;
				pauseTracking();
				try {
					if (cleanup) cleanup();
					activeWatcher = effect;
					const args = [
						newValue,
						oldValue === INITIAL_WATCHER_VALUE ? void 0 : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE ? [] : oldValue,
						boundCleanup
					];
					oldValue = newValue;
					call ? call(cb, 3, args) : cb(...args);
				} finally {
					activeWatcher = currentWatcher;
					resetTracking();
				}
			}
		} else effect.run();
	};
	if (augmentJob) augmentJob(job);
	effect = new ReactiveEffect(getter);
	effect.scheduler = scheduler ? () => scheduler(job, false) : job;
	boundCleanup = (fn) => onWatcherCleanup(fn, false, effect);
	cleanup = effect.onStop = () => {
		const cleanups = cleanupMap.get(effect);
		if (cleanups) {
			if (call) call(cleanups, 4);
			else for (const cleanup2 of cleanups) cleanup2();
			cleanupMap.delete(effect);
		}
	};
	if (cb) {
		if (immediate) job(true);
		else oldValue = effect.run();
	} else if (scheduler) scheduler(job.bind(null, true), true);
	else effect.run();
	watchHandle.pause = effect.pause.bind(effect);
	watchHandle.resume = effect.resume.bind(effect);
	watchHandle.stop = watchHandle;
	return watchHandle;
}
function traverse(value, depth = Infinity, seen) {
	if (depth <= 0 || !isObject(value) || value["__v_skip"]) return value;
	seen = seen || /* @__PURE__ */ new Map();
	if ((seen.get(value) || 0) >= depth) return value;
	seen.set(value, depth);
	depth--;
	if (/* @__PURE__ */ isRef(value)) traverse(value.value, depth, seen);
	else if (isArray$1(value)) for (let i = 0; i < value.length; i++) traverse(value[i], depth, seen);
	else if (isSet(value) || isMap(value)) value.forEach((v) => {
		traverse(v, depth, seen);
	});
	else if (isPlainObject$1(value)) {
		for (const key in value) traverse(value[key], depth, seen);
		for (const key of Object.getOwnPropertySymbols(value)) if (Object.prototype.propertyIsEnumerable.call(value, key)) traverse(value[key], depth, seen);
	}
	return value;
}
// node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js
/**
* @vue/runtime-core v3.5.44
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
function callWithErrorHandling(fn, instance, type, args) {
	try {
		return args ? fn(...args) : fn();
	} catch (err) {
		handleError(err, instance, type);
	}
}
function callWithAsyncErrorHandling(fn, instance, type, args) {
	if (isFunction(fn)) {
		const res = callWithErrorHandling(fn, instance, type, args);
		if (res && isPromise(res)) res.catch((err) => {
			handleError(err, instance, type);
		});
		return res;
	}
	if (isArray$1(fn)) {
		const values = [];
		for (let i = 0; i < fn.length; i++) values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
		return values;
	}
}
function handleError(err, instance, type, throwInDev = true) {
	const contextVNode = instance ? instance.vnode : null;
	const { errorHandler, throwUnhandledErrorInProduction } = instance && instance.appContext.config || EMPTY_OBJ;
	if (instance) {
		let cur = instance.parent;
		const exposedInstance = instance.proxy;
		const errorInfo = `https://vuejs.org/error-reference/#runtime-${type}`;
		while (cur) {
			const errorCapturedHooks = cur.ec;
			if (errorCapturedHooks) {
				for (let i = 0; i < errorCapturedHooks.length; i++) if (errorCapturedHooks[i](err, exposedInstance, errorInfo) === false) return;
			}
			cur = cur.parent;
		}
		if (errorHandler) {
			pauseTracking();
			callWithErrorHandling(errorHandler, null, 10, [
				err,
				exposedInstance,
				errorInfo
			]);
			resetTracking();
			return;
		}
	}
	logError(err, type, contextVNode, throwInDev, throwUnhandledErrorInProduction);
}
function logError(err, type, contextVNode, throwInDev = true, throwInProd = false) {
	if (throwInProd) throw err;
	else console.error(err);
}
var queue = [];
var flushIndex = -1;
var pendingPostFlushCbs = [];
var activePostFlushCbs = null;
var postFlushIndex = 0;
var resolvedPromise = /* @__PURE__ */ Promise.resolve();
var currentFlushPromise = null;
function nextTick(fn) {
	const p = currentFlushPromise || resolvedPromise;
	return fn ? p.then(this ? fn.bind(this) : fn) : p;
}
function findInsertionIndex$1(id) {
	let start = flushIndex + 1;
	let end = queue.length;
	while (start < end) {
		const middle = start + end >>> 1;
		const middleJob = queue[middle];
		const middleJobId = getId(middleJob);
		if (middleJobId < id || middleJobId === id && middleJob.flags & 2) start = middle + 1;
		else end = middle;
	}
	return start;
}
function queueJob(job) {
	if (!(job.flags & 1)) {
		const jobId = getId(job);
		const lastJob = queue[queue.length - 1];
		if (!lastJob || !(job.flags & 2) && jobId >= getId(lastJob)) queue.push(job);
		else queue.splice(findInsertionIndex$1(jobId), 0, job);
		job.flags |= 1;
		queueFlush();
	}
}
function queueFlush() {
	if (!currentFlushPromise) currentFlushPromise = resolvedPromise.then(flushJobs);
}
function queuePostFlushCb(cb) {
	if (!isArray$1(cb)) {
		if (activePostFlushCbs && cb.id === -1) activePostFlushCbs.splice(postFlushIndex + 1, 0, cb);
		else if (!(cb.flags & 1)) {
			pendingPostFlushCbs.push(cb);
			cb.flags |= 1;
		}
	} else for (let i = 0; i < cb.length; i++) pendingPostFlushCbs.push(cb[i]);
	queueFlush();
}
function flushPreFlushCbs(instance, minUid, seen, i = flushIndex + 1) {
	for (; i < queue.length; i++) {
		const cb = queue[i];
		if (cb && cb.flags & 2) {
			if (instance && cb.id !== instance.uid || minUid !== void 0 && !(cb.id >= minUid)) continue;
			queue.splice(i, 1);
			i = instance ? i - 1 : flushIndex;
			if (cb.flags & 4) cb.flags &= -2;
			cb();
			if (!(cb.flags & 4)) cb.flags &= -2;
		}
	}
}
function flushPostFlushCbs(seen, skip, minUid = 0) {
	if (pendingPostFlushCbs.length) {
		let cbs = pendingPostFlushCbs;
		let kept = 0;
		if (skip) {
			cbs = [];
			for (let i = 0; i < pendingPostFlushCbs.length; i++) {
				const cb = pendingPostFlushCbs[i];
				if (cb.i !== void 0 ? !cb.i || cb.i.uid < minUid : skip.has(cb)) pendingPostFlushCbs[kept++] = cb;
				else cbs.push(cb);
			}
		}
		const deduped = [...new Set(cbs)].sort((a, b) => getId(a) - getId(b));
		pendingPostFlushCbs.length = kept;
		if (activePostFlushCbs) {
			for (let i = 0; i < deduped.length; i++) activePostFlushCbs.push(deduped[i]);
			return;
		}
		activePostFlushCbs = deduped;
		for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
			const cb = activePostFlushCbs[postFlushIndex];
			if (cb.flags & 4) cb.flags &= -2;
			if (!(cb.flags & 8)) cb();
			cb.flags &= -2;
		}
		activePostFlushCbs = null;
		postFlushIndex = 0;
	}
}
var isFlushing = false;
function flushOnAppMount(fn, minUid) {
	if (isFlushing) {
		fn();
		return;
	}
	const queued = minUid === void 0 ? void 0 : new Set(pendingPostFlushCbs);
	fn();
	isFlushing = true;
	try {
		flushPreFlushCbs(void 0, minUid);
		flushPostFlushCbs(void 0, queued, minUid);
	} finally {
		isFlushing = false;
	}
}
var getId = (job) => job.id == null ? job.flags & 2 ? -1 : Infinity : job.id;
function flushJobs(seen) {
	try {
		for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
			const job = queue[flushIndex];
			if (job && !(job.flags & 8)) {
				if (job.flags & 4) job.flags &= -2;
				callWithErrorHandling(job, job.i, job.i ? 15 : 14);
				if (!(job.flags & 4)) job.flags &= -2;
			}
		}
	} finally {
		for (; flushIndex < queue.length; flushIndex++) {
			const job = queue[flushIndex];
			if (job) job.flags &= -2;
		}
		flushIndex = -1;
		queue.length = 0;
		flushPostFlushCbs(seen);
		currentFlushPromise = null;
		if (queue.length || pendingPostFlushCbs.length) flushJobs(seen);
	}
}
var currentRenderingInstance = null;
var currentScopeId = null;
function setCurrentRenderingInstance(instance) {
	const prev = currentRenderingInstance;
	currentRenderingInstance = instance;
	currentScopeId = instance && instance.type.__scopeId || null;
	return prev;
}
function withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot) {
	if (!ctx) return fn;
	if (fn._n) return fn;
	const renderFnWithContext = (...args) => {
		if (renderFnWithContext._d) setBlockTracking(-1);
		const prevInstance = setCurrentRenderingInstance(ctx);
		const prevStackSize = blockStack.length;
		let res;
		try {
			res = fn(...args);
		} finally {
			for (let i = blockStack.length; i > prevStackSize; i--) closeBlock();
			setCurrentRenderingInstance(prevInstance);
			if (renderFnWithContext._d) setBlockTracking(1);
		}
		return res;
	};
	renderFnWithContext._n = true;
	renderFnWithContext._c = true;
	renderFnWithContext._d = true;
	return renderFnWithContext;
}
function withDirectives(vnode, directives) {
	if (currentRenderingInstance === null) return vnode;
	const instance = getComponentPublicInstance(currentRenderingInstance);
	const bindings = vnode.dirs || (vnode.dirs = []);
	for (let i = 0; i < directives.length; i++) {
		let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i];
		if (dir) {
			if (isFunction(dir)) dir = {
				mounted: dir,
				updated: dir
			};
			if (dir.deep) traverse(value);
			bindings.push({
				dir,
				instance,
				value,
				oldValue: void 0,
				arg,
				modifiers
			});
		}
	}
	return vnode;
}
function invokeDirectiveHook(vnode, prevVNode, instance, name) {
	const bindings = vnode.dirs;
	const oldBindings = prevVNode && prevVNode.dirs;
	for (let i = 0; i < bindings.length; i++) {
		const binding = bindings[i];
		if (oldBindings) binding.oldValue = oldBindings[i].value;
		let hook = binding.dir[name];
		if (hook) {
			pauseTracking();
			callWithAsyncErrorHandling(hook, instance, 8, [
				vnode.el,
				binding,
				vnode,
				prevVNode
			]);
			resetTracking();
		}
	}
}
function provide(key, value) {
	if (currentInstance) {
		let provides = currentInstance.provides;
		const parentProvides = currentInstance.parent && currentInstance.parent.provides;
		if (parentProvides === provides) provides = currentInstance.provides = Object.create(parentProvides);
		provides[key] = value;
	}
}
function inject(key, defaultValue, treatDefaultAsFactory = false) {
	const instance = getCurrentInstance();
	if (instance || currentApp) {
		let provides = currentApp ? currentApp._context.provides : instance ? instance.parent == null || instance.ce ? instance.vnode.appContext && instance.vnode.appContext.provides : instance.parent.provides : void 0;
		if (provides && key in provides) return provides[key];
		else if (arguments.length > 1) return treatDefaultAsFactory && isFunction(defaultValue) ? defaultValue.call(instance && instance.proxy) : defaultValue;
	}
}
function hasInjectionContext() {
	return !!(getCurrentInstance() || currentApp);
}
var ssrContextKey = /* @__PURE__ */ Symbol.for("v-scx");
var useSSRContext = () => {
	{
		const ctx = inject(ssrContextKey);
		if (!ctx) {}
		return ctx;
	}
};
function watch(source, cb, options) {
	return doWatch(source, cb, options);
}
function doWatch(source, cb, options = EMPTY_OBJ) {
	const { immediate, deep, flush, once } = options;
	const baseWatchOptions = extend({}, options);
	const runsImmediately = cb && immediate || !cb && flush !== "post";
	let ssrCleanup;
	if (isInSSRComponentSetup) {
		if (flush === "sync") {
			const ctx = useSSRContext();
			ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = []);
		} else if (!runsImmediately) {
			const watchStopHandle = () => {};
			watchStopHandle.stop = NOOP;
			watchStopHandle.resume = NOOP;
			watchStopHandle.pause = NOOP;
			return watchStopHandle;
		}
	}
	const instance = currentInstance;
	baseWatchOptions.call = (fn, type, args) => callWithAsyncErrorHandling(fn, instance, type, args);
	let isPre = false;
	if (flush === "post") baseWatchOptions.scheduler = (job) => {
		job.i = instance;
		queuePostRenderEffect(job, instance && instance.suspense);
	};
	else if (flush !== "sync") {
		isPre = true;
		baseWatchOptions.scheduler = (job, isFirstRun) => {
			if (isFirstRun) job();
			else queueJob(job);
		};
	}
	baseWatchOptions.augmentJob = (job) => {
		if (cb) job.flags |= 4;
		if (isPre) {
			job.flags |= 2;
			if (instance) {
				job.id = instance.uid;
				job.i = instance;
			}
		}
	};
	const watchHandle = watch$1(source, cb, baseWatchOptions);
	if (isInSSRComponentSetup) {
		if (ssrCleanup) ssrCleanup.push(watchHandle);
		else if (runsImmediately) watchHandle();
	}
	return watchHandle;
}
function instanceWatch(source, value, options) {
	const publicThis = this.proxy;
	const getter = isString(source) ? source.includes(".") ? createPathGetter(publicThis, source) : () => publicThis[source] : source.bind(publicThis, publicThis);
	let cb;
	if (isFunction(value)) cb = value;
	else {
		cb = value.handler;
		options = value;
	}
	const reset = setCurrentInstance(this);
	const res = doWatch(getter, cb.bind(publicThis), options);
	reset();
	return res;
}
function createPathGetter(ctx, path) {
	const segments = path.split(".");
	return () => {
		let cur = ctx;
		for (let i = 0; i < segments.length && cur; i++) cur = cur[segments[i]];
		return cur;
	};
}
var TeleportEndKey = /* @__PURE__ */ Symbol("_vte");
var isTeleport = (type) => type.__isTeleport;
var leaveCbKey = /* @__PURE__ */ Symbol("_leaveCb");
function findNonCommentChild(children) {
	let child = children[0];
	if (children.length > 1) {
		for (const c of children) if (c.type !== Comment) {
			child = c;
			break;
		}
	}
	return child;
}
function getInnerChild$1(vnode) {
	if (!isKeepAlive(vnode)) {
		if (isTeleport(vnode.type) && vnode.children) return findNonCommentChild(vnode.children);
		return vnode;
	}
	if (vnode.component) return vnode.component.subTree;
	const { shapeFlag, children } = vnode;
	if (children) {
		if (shapeFlag & 16) return children[0];
		if (shapeFlag & 32 && isFunction(children.default)) return children.default();
	}
}
function setTransitionHooks(vnode, hooks) {
	if (vnode.shapeFlag & 6 && vnode.component) {
		vnode.transition = hooks;
		const subTree = vnode.component.subTree;
		setTransitionHooks(isTeleport(subTree.type) ? getInnerChild$1(subTree) || subTree : subTree, hooks);
	} else if (vnode.shapeFlag & 128) {
		vnode.ssContent.transition = hooks.clone(vnode.ssContent);
		vnode.ssFallback.transition = hooks.clone(vnode.ssFallback);
	} else {
		vnode.transition = hooks;
		if (vnode.type === Fragment && isArray$1(vnode.children)) {
			const child = filterSingleRoot(vnode.children, false);
			if (child) setTransitionHooks(child, hooks);
		}
	}
}
function getTransitionRoot(vnode) {
	if (vnode.component) return getTransitionRoot(vnode.component.subTree);
	if (vnode.type === Fragment) {
		const child = isArray$1(vnode.children) && filterSingleRoot(vnode.children, false);
		return child ? getTransitionRoot(child) : void 0;
	}
	if (vnode.type !== Comment) return vnode;
}
// @__NO_SIDE_EFFECTS__
function defineComponent(options, extraOptions) {
	return isFunction(options) ? /* @__PURE__ */ (() => extend({ name: options.name }, extraOptions, { setup: options }))() : options;
}
function markAsyncBoundary(instance) {
	instance.ids = [
		instance.ids[0] + instance.ids[2]++ + "-",
		0,
		0
	];
}
function isTemplateRefKey(refs, key) {
	let desc;
	return !!((desc = Object.getOwnPropertyDescriptor(refs, key)) && !desc.configurable);
}
var pendingSetRefMap = /* @__PURE__ */ new WeakMap();
function setRef(rawRef, oldRawRef, parentSuspense, vnode, isUnmount = false) {
	if (isArray$1(rawRef)) {
		rawRef.forEach((r, i) => setRef(r, oldRawRef && (isArray$1(oldRawRef) ? oldRawRef[i] : oldRawRef), parentSuspense, vnode, isUnmount));
		return;
	}
	if (isAsyncWrapper(vnode) && !isUnmount) {
		if (vnode.shapeFlag & 512 && vnode.type.__asyncResolved && vnode.component.subTree.component) setRef(rawRef, oldRawRef, parentSuspense, vnode.component.subTree);
		return;
	}
	const refValue = vnode.shapeFlag & 4 ? getComponentPublicInstance(vnode.component) : vnode.el;
	const value = isUnmount ? null : refValue;
	const { i: owner, r: ref } = rawRef;
	const oldRef = oldRawRef && oldRawRef.r;
	const refs = owner.refs === EMPTY_OBJ ? owner.refs = {} : owner.refs;
	const setupState = owner.setupState;
	const rawSetupState = /* @__PURE__ */ toRaw(setupState);
	const canSetSetupRef = setupState === EMPTY_OBJ ? NO : (key) => {
		if (isTemplateRefKey(refs, key)) return false;
		return hasOwn(rawSetupState, key);
	};
	const canSetRef = (ref2, key) => {
		if (key && isTemplateRefKey(refs, key)) return false;
		return true;
	};
	if (oldRef != null && oldRef !== ref) {
		invalidatePendingSetRef(oldRawRef);
		if (isString(oldRef)) {
			refs[oldRef] = null;
			if (canSetSetupRef(oldRef)) setupState[oldRef] = null;
		} else if (/* @__PURE__ */ isRef(oldRef)) {
			const oldRawRefAtom = oldRawRef;
			if (canSetRef(oldRef, oldRawRefAtom.k)) oldRef.value = null;
			if (oldRawRefAtom.k) refs[oldRawRefAtom.k] = null;
		}
	}
	if (isFunction(ref)) callWithErrorHandling(ref, owner, 12, [value, refs]);
	else {
		const _isString = isString(ref);
		const _isRef = /* @__PURE__ */ isRef(ref);
		if (_isString || _isRef) {
			const doSet = () => {
				if (rawRef.f) {
					const existing = _isString ? canSetSetupRef(ref) ? setupState[ref] : refs[ref] : canSetRef(ref) || !rawRef.k ? ref.value : refs[rawRef.k];
					if (isUnmount) isArray$1(existing) && remove(existing, refValue);
					else if (!isArray$1(existing)) {
						if (_isString) {
							refs[ref] = [refValue];
							if (canSetSetupRef(ref)) setupState[ref] = refs[ref];
						} else {
							const newVal = [refValue];
							if (canSetRef(ref, rawRef.k)) ref.value = newVal;
							if (rawRef.k) refs[rawRef.k] = newVal;
						}
					} else if (!existing.includes(refValue)) existing.push(refValue);
				} else if (_isString) {
					refs[ref] = value;
					if (canSetSetupRef(ref)) setupState[ref] = value;
				} else if (_isRef) {
					if (canSetRef(ref, rawRef.k)) ref.value = value;
					if (rawRef.k) refs[rawRef.k] = value;
				}
			};
			if (value) {
				const job = () => {
					doSet();
					pendingSetRefMap.delete(rawRef);
				};
				job.id = -1;
				pendingSetRefMap.set(rawRef, job);
				queuePostRenderEffect(job, parentSuspense);
			} else {
				invalidatePendingSetRef(rawRef);
				doSet();
			}
		}
	}
}
function invalidatePendingSetRef(rawRef) {
	const pendingSetRef = pendingSetRefMap.get(rawRef);
	if (pendingSetRef) {
		pendingSetRef.flags |= 8;
		pendingSetRefMap.delete(rawRef);
	}
}
getGlobalThis().requestIdleCallback;
getGlobalThis().cancelIdleCallback;
var isAsyncWrapper = (i) => !!i.type.__asyncLoader;
var isKeepAlive = (vnode) => vnode.type.__isKeepAlive;
function onActivated(hook, target) {
	registerKeepAliveHook(hook, "a", target);
}
function onDeactivated(hook, target) {
	registerKeepAliveHook(hook, "da", target);
}
function registerKeepAliveHook(hook, type, target = currentInstance) {
	const wrappedHook = hook.__wdc || (hook.__wdc = () => {
		let current = target;
		while (current) {
			if (current.isDeactivated) return;
			current = current.parent;
		}
		return hook();
	});
	injectHook(type, wrappedHook, target);
	if (target) {
		let current = target.parent;
		while (current && current.parent) {
			if (isKeepAlive(current.parent.vnode)) injectToKeepAliveRoot(wrappedHook, type, target, current);
			current = current.parent;
		}
	}
}
function injectToKeepAliveRoot(hook, type, target, keepAliveRoot) {
	const injected = injectHook(type, hook, keepAliveRoot, true);
	onUnmounted(() => {
		remove(keepAliveRoot[type], injected);
	}, target);
}
function injectHook(type, hook, target = currentInstance, prepend = false) {
	if (target) {
		const hooks = target[type] || (target[type] = []);
		const wrappedHook = hook.__weh || (hook.__weh = (...args) => {
			pauseTracking();
			const reset = setCurrentInstance(target);
			const res = callWithAsyncErrorHandling(hook, target, type, args);
			reset();
			resetTracking();
			return res;
		});
		if (prepend) hooks.unshift(wrappedHook);
		else hooks.push(wrappedHook);
		return wrappedHook;
	}
}
var createHook = (lifecycle) => (hook, target = currentInstance) => {
	if (!isInSSRComponentSetup || lifecycle === "sp") injectHook(lifecycle, (...args) => hook(...args), target);
};
var onBeforeMount = createHook("bm");
var onMounted = createHook("m");
var onBeforeUpdate = createHook("bu");
var onUpdated = createHook("u");
var onBeforeUnmount = createHook("bum");
var onUnmounted = createHook("um");
var onServerPrefetch = createHook("sp");
var onRenderTriggered = createHook("rtg");
var onRenderTracked = createHook("rtc");
function onErrorCaptured(hook, target = currentInstance) {
	injectHook("ec", hook, target);
}
var COMPONENTS = "components";
function resolveComponent(name, maybeSelfReference) {
	return resolveAsset(COMPONENTS, name, true, maybeSelfReference) || name;
}
var NULL_DYNAMIC_COMPONENT = /* @__PURE__ */ Symbol.for("v-ndc");
function resolveDynamicComponent(component) {
	if (isString(component)) return resolveAsset(COMPONENTS, component, false) || component;
	else return component || NULL_DYNAMIC_COMPONENT;
}
function resolveAsset(type, name, warnMissing = true, maybeSelfReference = false) {
	const instance = currentRenderingInstance || currentInstance;
	if (instance) {
		const Component = instance.type;
		if (type === COMPONENTS) {
			const selfName = getComponentName(Component, false);
			if (selfName && (selfName === name || selfName === camelize(name) || selfName === capitalize(camelize(name)))) return Component;
		}
		const res = resolve(instance[type] || Component[type], name) || resolve(instance.appContext[type], name);
		if (!res && maybeSelfReference) return Component;
		return res;
	}
}
function resolve(registry, name) {
	return registry && (registry[name] || registry[camelize(name)] || registry[capitalize(camelize(name))]);
}
function renderList(source, renderItem, cache, index) {
	let ret;
	const cached = cache && cache[index];
	const sourceIsArray = isArray$1(source);
	if (sourceIsArray || isString(source)) {
		const sourceIsReactiveArray = sourceIsArray && /* @__PURE__ */ isReactive(source);
		let needsWrap = false;
		let isReadonlySource = false;
		if (sourceIsReactiveArray) {
			needsWrap = !/* @__PURE__ */ isShallow(source);
			isReadonlySource = /* @__PURE__ */ isReadonly(source);
			source = shallowReadArray(source);
		}
		ret = new Array(source.length);
		for (let i = 0, l = source.length; i < l; i++) ret[i] = renderItem(needsWrap ? isReadonlySource ? toReadonly(toReactive(source[i])) : toReactive(source[i]) : source[i], i, void 0, cached && cached[i]);
	} else if (typeof source === "number") {
		if (!Number.isInteger(source) || source < 0) ret = [];
		else {
			ret = new Array(source);
			for (let i = 0; i < source; i++) ret[i] = renderItem(i + 1, i, void 0, cached && cached[i]);
		}
	} else if (isObject(source)) {
		if (source[Symbol.iterator]) ret = Array.from(source, (item, i) => renderItem(item, i, void 0, cached && cached[i]));
		else {
			const keys = Object.keys(source);
			ret = new Array(keys.length);
			for (let i = 0, l = keys.length; i < l; i++) {
				const key = keys[i];
				ret[i] = renderItem(source[key], key, i, cached && cached[i]);
			}
		}
	} else ret = [];
	if (cache) cache[index] = ret;
	return ret;
}
var getPublicInstance = (i) => {
	if (!i) return null;
	if (isStatefulComponent(i)) return getComponentPublicInstance(i);
	return getPublicInstance(i.parent);
};
var publicPropertiesMap = /* @__PURE__ */ extend(/* @__PURE__ */ Object.create(null), {
	$: (i) => i,
	$el: (i) => i.vnode.el,
	$data: (i) => i.data,
	$props: (i) => i.props,
	$attrs: (i) => i.attrs,
	$slots: (i) => i.slots,
	$refs: (i) => i.refs,
	$parent: (i) => getPublicInstance(i.parent),
	$root: (i) => getPublicInstance(i.root),
	$host: (i) => i.ce,
	$emit: (i) => i.emit,
	$options: (i) => resolveMergedOptions(i),
	$forceUpdate: (i) => i.f || (i.f = () => {
		queueJob(i.update);
	}),
	$nextTick: (i) => i.n || (i.n = nextTick.bind(i.proxy)),
	$watch: (i) => instanceWatch.bind(i)
});
var hasSetupBinding = (state, key) => state !== EMPTY_OBJ && !state.__isScriptSetup && hasOwn(state, key);
var PublicInstanceProxyHandlers = {
	get({ _: instance }, key) {
		if (key === "__v_skip") return true;
		const { ctx, setupState, data, props, accessCache, type, appContext } = instance;
		if (key[0] !== "$") {
			const n = accessCache[key];
			if (n !== void 0) switch (n) {
				case 1: return setupState[key];
				case 2: return data[key];
				case 4: return ctx[key];
				case 3: return props[key];
			}
			else if (hasSetupBinding(setupState, key)) {
				accessCache[key] = 1;
				return setupState[key];
			} else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
				accessCache[key] = 2;
				return data[key];
			} else if (hasOwn(props, key)) {
				accessCache[key] = 3;
				return props[key];
			} else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
				accessCache[key] = 4;
				return ctx[key];
			} else if (shouldCacheAccess) accessCache[key] = 0;
		}
		const publicGetter = publicPropertiesMap[key];
		let cssModule, globalProperties;
		if (publicGetter) {
			if (key === "$attrs") track(instance.attrs, "get", "");
			return publicGetter(instance);
		} else if ((cssModule = type.__cssModules) && (cssModule = cssModule[key])) return cssModule;
		else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
			accessCache[key] = 4;
			return ctx[key];
		} else if (globalProperties = appContext.config.globalProperties, hasOwn(globalProperties, key)) return globalProperties[key];
	},
	set({ _: instance }, key, value) {
		const { data, setupState, ctx } = instance;
		if (hasSetupBinding(setupState, key)) {
			setupState[key] = value;
			return true;
		} else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
			data[key] = value;
			return true;
		} else if (hasOwn(instance.props, key)) return false;
		if (key[0] === "$" && key.slice(1) in instance) return false;
		else ctx[key] = value;
		return true;
	},
	has({ _: { data, setupState, accessCache, ctx, appContext, props, type } }, key) {
		let cssModules;
		return !!(accessCache[key] || data !== EMPTY_OBJ && key[0] !== "$" && hasOwn(data, key) || hasSetupBinding(setupState, key) || hasOwn(props, key) || hasOwn(ctx, key) || hasOwn(publicPropertiesMap, key) || hasOwn(appContext.config.globalProperties, key) || (cssModules = type.__cssModules) && cssModules[key]);
	},
	defineProperty(target, key, descriptor) {
		if (descriptor.get != null) target._.accessCache[key] = 0;
		else if (hasOwn(descriptor, "value")) this.set(target, key, descriptor.value, null);
		return Reflect.defineProperty(target, key, descriptor);
	}
};
function normalizePropsOrEmits(props) {
	return isArray$1(props) ? props.reduce((normalized, p) => (normalized[p] = null, normalized), {}) : props;
}
var shouldCacheAccess = true;
function applyOptions(instance) {
	const options = resolveMergedOptions(instance);
	const publicThis = instance.proxy;
	const ctx = instance.ctx;
	shouldCacheAccess = false;
	if (options.beforeCreate) callHook(options.beforeCreate, instance, "bc");
	const { data: dataOptions, computed: computedOptions, methods, watch: watchOptions, provide: provideOptions, inject: injectOptions, created, beforeMount, mounted, beforeUpdate, updated, activated, deactivated, beforeDestroy, beforeUnmount, destroyed, unmounted, render, renderTracked, renderTriggered, errorCaptured, serverPrefetch, expose, inheritAttrs, components, directives, filters } = options;
	const checkDuplicateProperties = null;
	if (injectOptions) resolveInjections(injectOptions, ctx, checkDuplicateProperties);
	if (methods) for (const key in methods) {
		const methodHandler = methods[key];
		if (isFunction(methodHandler)) ctx[key] = methodHandler.bind(publicThis);
	}
	if (dataOptions) {
		const data = dataOptions.call(publicThis, publicThis);
		if (!isObject(data)) {} else instance.data = /* @__PURE__ */ reactive(data);
	}
	shouldCacheAccess = true;
	if (computedOptions) for (const key in computedOptions) {
		const opt = computedOptions[key];
		const c = computed({
			get: isFunction(opt) ? opt.bind(publicThis, publicThis) : isFunction(opt.get) ? opt.get.bind(publicThis, publicThis) : NOOP,
			set: !isFunction(opt) && isFunction(opt.set) ? opt.set.bind(publicThis) : NOOP
		});
		Object.defineProperty(ctx, key, {
			enumerable: true,
			configurable: true,
			get: () => c.value,
			set: (v) => c.value = v
		});
	}
	if (watchOptions) for (const key in watchOptions) createWatcher(watchOptions[key], ctx, publicThis, key);
	if (provideOptions) {
		const provides = isFunction(provideOptions) ? provideOptions.call(publicThis) : provideOptions;
		Reflect.ownKeys(provides).forEach((key) => {
			provide(key, provides[key]);
		});
	}
	if (created) callHook(created, instance, "c");
	function registerLifecycleHook(register, hook) {
		if (isArray$1(hook)) hook.forEach((_hook) => register(_hook.bind(publicThis)));
		else if (hook) register(hook.bind(publicThis));
	}
	registerLifecycleHook(onBeforeMount, beforeMount);
	registerLifecycleHook(onMounted, mounted);
	registerLifecycleHook(onBeforeUpdate, beforeUpdate);
	registerLifecycleHook(onUpdated, updated);
	registerLifecycleHook(onActivated, activated);
	registerLifecycleHook(onDeactivated, deactivated);
	registerLifecycleHook(onErrorCaptured, errorCaptured);
	registerLifecycleHook(onRenderTracked, renderTracked);
	registerLifecycleHook(onRenderTriggered, renderTriggered);
	registerLifecycleHook(onBeforeUnmount, beforeUnmount);
	registerLifecycleHook(onUnmounted, unmounted);
	registerLifecycleHook(onServerPrefetch, serverPrefetch);
	if (isArray$1(expose)) {
		if (expose.length) {
			const exposed = instance.exposed || (instance.exposed = {});
			expose.forEach((key) => {
				Object.defineProperty(exposed, key, {
					get: () => publicThis[key],
					set: (val) => publicThis[key] = val,
					enumerable: true
				});
			});
		} else if (!instance.exposed) instance.exposed = {};
	}
	if (render && instance.render === NOOP) instance.render = render;
	if (inheritAttrs != null) instance.inheritAttrs = inheritAttrs;
	if (components) instance.components = components;
	if (directives) instance.directives = directives;
	if (serverPrefetch) markAsyncBoundary(instance);
}
function resolveInjections(injectOptions, ctx, checkDuplicateProperties = NOOP) {
	if (isArray$1(injectOptions)) injectOptions = normalizeInject(injectOptions);
	for (const key in injectOptions) {
		const opt = injectOptions[key];
		let injected;
		if (isObject(opt)) {
			if ("default" in opt) injected = inject(opt.from || key, opt.default, true);
			else injected = inject(opt.from || key);
		} else injected = inject(opt);
		if (/* @__PURE__ */ isRef(injected)) Object.defineProperty(ctx, key, {
			enumerable: true,
			configurable: true,
			get: () => injected.value,
			set: (v) => injected.value = v
		});
		else ctx[key] = injected;
	}
}
function callHook(hook, instance, type) {
	callWithAsyncErrorHandling(isArray$1(hook) ? hook.map((h) => h.bind(instance.proxy)) : hook.bind(instance.proxy), instance, type);
}
function createWatcher(raw, ctx, publicThis, key) {
	let getter = key.includes(".") ? createPathGetter(publicThis, key) : () => publicThis[key];
	if (isString(raw)) {
		const handler = ctx[raw];
		if (isFunction(handler)) watch(getter, handler);
	} else if (isFunction(raw)) watch(getter, raw.bind(publicThis));
	else if (isObject(raw)) {
		if (isArray$1(raw)) raw.forEach((r) => createWatcher(r, ctx, publicThis, key));
		else {
			const handler = isFunction(raw.handler) ? raw.handler.bind(publicThis) : ctx[raw.handler];
			if (isFunction(handler)) watch(getter, handler, raw);
		}
	}
}
function resolveMergedOptions(instance) {
	const base = instance.type;
	const { mixins, extends: extendsOptions } = base;
	const { mixins: globalMixins, optionsCache: cache, config: { optionMergeStrategies } } = instance.appContext;
	const cached = cache.get(base);
	let resolved;
	if (cached) resolved = cached;
	else if (!globalMixins.length && !mixins && !extendsOptions) resolved = base;
	else {
		resolved = {};
		if (globalMixins.length) globalMixins.forEach((m) => mergeOptions$1(resolved, m, optionMergeStrategies, true));
		mergeOptions$1(resolved, base, optionMergeStrategies);
	}
	if (isObject(base)) cache.set(base, resolved);
	return resolved;
}
function mergeOptions$1(to, from, strats, asMixin = false) {
	const { mixins, extends: extendsOptions } = from;
	if (extendsOptions) mergeOptions$1(to, extendsOptions, strats, true);
	if (mixins) mixins.forEach((m) => mergeOptions$1(to, m, strats, true));
	for (const key in from) if (asMixin && key === "expose") {} else {
		const strat = internalOptionMergeStrats[key] || strats && strats[key];
		to[key] = strat ? strat(to[key], from[key]) : from[key];
	}
	return to;
}
var internalOptionMergeStrats = {
	data: mergeDataFn,
	props: mergeEmitsOrPropsOptions,
	emits: mergeEmitsOrPropsOptions,
	methods: mergeObjectOptions,
	computed: mergeObjectOptions,
	beforeCreate: mergeAsArray,
	created: mergeAsArray,
	beforeMount: mergeAsArray,
	mounted: mergeAsArray,
	beforeUpdate: mergeAsArray,
	updated: mergeAsArray,
	beforeDestroy: mergeAsArray,
	beforeUnmount: mergeAsArray,
	destroyed: mergeAsArray,
	unmounted: mergeAsArray,
	activated: mergeAsArray,
	deactivated: mergeAsArray,
	errorCaptured: mergeAsArray,
	serverPrefetch: mergeAsArray,
	components: mergeObjectOptions,
	directives: mergeObjectOptions,
	watch: mergeWatchOptions,
	provide: mergeDataFn,
	inject: mergeInject
};
function mergeDataFn(to, from) {
	if (!from) return to;
	if (!to) return from;
	return function mergedDataFn() {
		return extend(isFunction(to) ? to.call(this, this) : to, isFunction(from) ? from.call(this, this) : from);
	};
}
function mergeInject(to, from) {
	return mergeObjectOptions(normalizeInject(to), normalizeInject(from));
}
function normalizeInject(raw) {
	if (isArray$1(raw)) {
		const res = {};
		for (let i = 0; i < raw.length; i++) res[raw[i]] = raw[i];
		return res;
	}
	return raw;
}
function mergeAsArray(to, from) {
	return to ? [...new Set([].concat(to, from))] : from;
}
function mergeObjectOptions(to, from) {
	return to ? extend(/* @__PURE__ */ Object.create(null), to, from) : from;
}
function mergeEmitsOrPropsOptions(to, from) {
	if (to) {
		if (isArray$1(to) && isArray$1(from)) return [.../* @__PURE__ */ new Set([...to, ...from])];
		return extend(/* @__PURE__ */ Object.create(null), normalizePropsOrEmits(to), normalizePropsOrEmits(from != null ? from : {}));
	} else return from;
}
function mergeWatchOptions(to, from) {
	if (!to) return from;
	if (!from) return to;
	const merged = extend(/* @__PURE__ */ Object.create(null), to);
	for (const key in from) merged[key] = mergeAsArray(to[key], from[key]);
	return merged;
}
function createAppContext() {
	return {
		app: null,
		config: {
			isNativeTag: NO,
			performance: false,
			globalProperties: {},
			optionMergeStrategies: {},
			errorHandler: void 0,
			warnHandler: void 0,
			compilerOptions: {}
		},
		mixins: [],
		components: {},
		directives: {},
		provides: /* @__PURE__ */ Object.create(null),
		optionsCache: /* @__PURE__ */ new WeakMap(),
		propsCache: /* @__PURE__ */ new WeakMap(),
		emitsCache: /* @__PURE__ */ new WeakMap()
	};
}
var uid$1 = 0;
function createAppAPI(render, hydrate) {
	return function createApp(rootComponent, rootProps = null) {
		if (!isFunction(rootComponent)) rootComponent = extend({}, rootComponent);
		if (rootProps != null && !isObject(rootProps)) rootProps = null;
		const context = createAppContext();
		const installedPlugins = /* @__PURE__ */ new WeakSet();
		const pluginCleanupFns = [];
		let isMounted = false;
		const app = context.app = {
			_uid: uid$1++,
			_component: rootComponent,
			_props: rootProps,
			_container: null,
			_context: context,
			_instance: null,
			version,
			get config() {
				return context.config;
			},
			set config(v) {},
			use(plugin, ...options) {
				if (installedPlugins.has(plugin)) {} else if (plugin && isFunction(plugin.install)) {
					installedPlugins.add(plugin);
					plugin.install(app, ...options);
				} else if (isFunction(plugin)) {
					installedPlugins.add(plugin);
					plugin(app, ...options);
				}
				return app;
			},
			mixin(mixin) {
				if (!context.mixins.includes(mixin)) context.mixins.push(mixin);
				return app;
			},
			component(name, component) {
				if (!component) return context.components[name];
				context.components[name] = component;
				return app;
			},
			directive(name, directive) {
				if (!directive) return context.directives[name];
				context.directives[name] = directive;
				return app;
			},
			mount(rootContainer, isHydrate, namespace) {
				if (!isMounted) {
					const vnode = app._ceVNode || createVNode(rootComponent, rootProps);
					vnode.appContext = context;
					if (namespace === true) namespace = "svg";
					else if (namespace === false) namespace = void 0;
					if (isHydrate && hydrate) hydrate(vnode, rootContainer);
					else render(vnode, rootContainer, namespace);
					isMounted = true;
					app._container = rootContainer;
					rootContainer.__vue_app__ = app;
					return getComponentPublicInstance(vnode.component);
				}
			},
			onUnmount(cleanupFn) {
				pluginCleanupFns.push(cleanupFn);
			},
			unmount() {
				if (isMounted) {
					callWithAsyncErrorHandling(pluginCleanupFns, app._instance, 16);
					render(null, app._container);
					delete app._container.__vue_app__;
				}
			},
			provide(key, value) {
				context.provides[key] = value;
				return app;
			},
			runWithContext(fn) {
				const lastApp = currentApp;
				currentApp = app;
				try {
					return fn();
				} finally {
					currentApp = lastApp;
				}
			}
		};
		return app;
	};
}
var currentApp = null;
var getModelModifiers = (props, modelName) => {
	return modelName === "modelValue" || modelName === "model-value" ? props.modelModifiers : props[`${modelName}Modifiers`] || props[`${camelize(modelName)}Modifiers`] || props[`${hyphenate(modelName)}Modifiers`];
};
function emit(instance, event, ...rawArgs) {
	if (instance.isUnmounted) return;
	const props = instance.vnode.props || EMPTY_OBJ;
	let args = rawArgs;
	const isModelListener = event.startsWith("update:");
	const modifiers = isModelListener && getModelModifiers(props, event.slice(7));
	if (modifiers) {
		if (modifiers.trim) args = rawArgs.map((a) => isString(a) ? a.trim() : a);
		if (modifiers.number) args = args.map(looseToNumber);
	}
	let handlerName;
	let handler = props[handlerName = toHandlerKey(event)] || props[handlerName = toHandlerKey(camelize(event))];
	if (!handler && isModelListener) handler = props[handlerName = toHandlerKey(hyphenate(event))];
	if (handler) callWithAsyncErrorHandling(handler, instance, 6, args);
	const onceHandler = props[handlerName + `Once`];
	if (onceHandler) {
		if (!instance.emitted) instance.emitted = {};
		else if (instance.emitted[handlerName]) return;
		instance.emitted[handlerName] = true;
		callWithAsyncErrorHandling(onceHandler, instance, 6, args);
	}
}
var mixinEmitsCache = /* @__PURE__ */ new WeakMap();
function normalizeEmitsOptions(comp, appContext, asMixin = false) {
	const cache = asMixin ? mixinEmitsCache : appContext.emitsCache;
	const cached = cache.get(comp);
	if (cached !== void 0) return cached;
	const raw = comp.emits;
	let normalized = {};
	let hasExtends = false;
	if (!isFunction(comp)) {
		const extendEmits = (raw2) => {
			const normalizedFromExtend = normalizeEmitsOptions(raw2, appContext, true);
			if (normalizedFromExtend) {
				hasExtends = true;
				extend(normalized, normalizedFromExtend);
			}
		};
		if (!asMixin && appContext.mixins.length) appContext.mixins.forEach(extendEmits);
		if (comp.extends) extendEmits(comp.extends);
		if (comp.mixins) comp.mixins.forEach(extendEmits);
	}
	if (!raw && !hasExtends) {
		if (isObject(comp)) cache.set(comp, null);
		return null;
	}
	if (isArray$1(raw)) raw.forEach((key) => normalized[key] = null);
	else extend(normalized, raw);
	if (isObject(comp)) cache.set(comp, normalized);
	return normalized;
}
function isEmitListener(options, key) {
	if (!options || !isOn(key)) return false;
	key = key.slice(2);
	key = key === "Once" ? key : key.replace(/Once$/, "");
	return hasOwn(options, key[0].toLowerCase() + key.slice(1)) || hasOwn(options, hyphenate(key)) || hasOwn(options, key);
}
function renderComponentRoot(instance) {
	const { type: Component, vnode, proxy, withProxy, propsOptions: [propsOptions], slots, attrs, emit, render, renderCache, props, data, setupState, ctx, inheritAttrs } = instance;
	const prev = setCurrentRenderingInstance(instance);
	let result;
	let fallthroughAttrs;
	try {
		if (vnode.shapeFlag & 4) {
			const proxyToUse = withProxy || proxy;
			const thisProxy = proxyToUse;
			result = normalizeVNode(render.call(thisProxy, proxyToUse, renderCache, props, setupState, data, ctx));
			fallthroughAttrs = attrs;
		} else {
			const render2 = Component;
			result = normalizeVNode(render2.length > 1 ? render2(props, {
				attrs,
				slots,
				emit
			}) : render2(props, null));
			fallthroughAttrs = Component.props ? attrs : getFunctionalFallthrough(attrs);
		}
	} catch (err) {
		blockStack.length = 0;
		handleError(err, instance, 1);
		result = createVNode(Comment);
	}
	let root = result;
	if (fallthroughAttrs && inheritAttrs !== false) {
		const keys = Object.keys(fallthroughAttrs);
		const { shapeFlag } = root;
		if (keys.length) {
			if (shapeFlag & 7) {
				if (propsOptions && keys.some(isModelListener)) fallthroughAttrs = filterModelListeners(fallthroughAttrs, propsOptions);
				root = cloneVNode(root, fallthroughAttrs, false, true);
			}
		}
	}
	if (vnode.dirs) {
		root = cloneVNode(root, null, false, true);
		root.dirs = root.dirs ? root.dirs.concat(vnode.dirs) : vnode.dirs;
	}
	if (vnode.transition) setTransitionHooks(isTeleport(root.type) ? getInnerChild$1(root) || root : root, vnode.transition);
	result = root;
	setCurrentRenderingInstance(prev);
	return result;
}
function filterSingleRoot(children, recurse = true) {
	let singleRoot;
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (isVNode(child)) {
			if (child.type !== Comment || child.children === "v-if") {
				if (singleRoot) return;
				else singleRoot = child;
			}
		} else return;
	}
	return singleRoot;
}
var getFunctionalFallthrough = (attrs) => {
	let res;
	for (const key in attrs) if (key === "class" || key === "style" || isOn(key)) (res || (res = {}))[key] = attrs[key];
	return res;
};
var filterModelListeners = (attrs, props) => {
	const res = {};
	for (const key in attrs) if (!isModelListener(key) || !(key.slice(9) in props)) res[key] = attrs[key];
	return res;
};
function shouldUpdateComponent(prevVNode, nextVNode, optimized) {
	const { props: prevProps, children: prevChildren, component } = prevVNode;
	const { props: nextProps, children: nextChildren, patchFlag } = nextVNode;
	const emits = component.emitsOptions;
	if (nextVNode.dirs || nextVNode.transition) return true;
	if (optimized && patchFlag >= 0) {
		if (patchFlag & 1024) return true;
		if (patchFlag & 16) {
			if (!prevProps) return !!nextProps;
			return hasPropsChanged(prevProps, nextProps, emits);
		} else if (patchFlag & 8) {
			const dynamicProps = nextVNode.dynamicProps;
			for (let i = 0; i < dynamicProps.length; i++) {
				const key = dynamicProps[i];
				if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emits, key)) return true;
			}
		}
	} else {
		if (prevChildren || nextChildren) {
			if (!nextChildren || !nextChildren.$stable) return true;
		}
		if (prevProps === nextProps) return false;
		if (!prevProps) return !!nextProps;
		if (!nextProps) return true;
		return hasPropsChanged(prevProps, nextProps, emits);
	}
	return false;
}
function hasPropsChanged(prevProps, nextProps, emitsOptions) {
	const nextKeys = Object.keys(nextProps);
	if (nextKeys.length !== Object.keys(prevProps).length) return true;
	for (let i = 0; i < nextKeys.length; i++) {
		const key = nextKeys[i];
		if (!hasOwn(prevProps, key) || hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emitsOptions, key)) return true;
	}
	return false;
}
function hasPropValueChanged(nextProps, prevProps, key) {
	const nextProp = nextProps[key];
	const prevProp = prevProps[key];
	if (key === "style" && isObject(nextProp) && isObject(prevProp)) return !looseEqual(nextProp, prevProp);
	return nextProp !== prevProp;
}
function updateHOCHostEl({ vnode, parent, suspense }, el) {
	while (parent) {
		const root = parent.subTree;
		if (root.suspense && root.suspense.activeBranch === vnode) {
			root.suspense.vnode.el = root.el = el;
			vnode = root;
		}
		if (root === vnode) {
			(vnode = parent.vnode).el = el;
			parent = parent.parent;
		} else break;
	}
	if (suspense && suspense.activeBranch === vnode) suspense.vnode.el = el;
}
var internalObjectProto = {};
var createInternalObject = () => Object.create(internalObjectProto);
var isInternalObject = (obj) => Object.getPrototypeOf(obj) === internalObjectProto;
function initProps(instance, rawProps, isStateful, isSSR = false) {
	const props = {};
	const attrs = createInternalObject();
	instance.propsDefaults = /* @__PURE__ */ Object.create(null);
	setFullProps(instance, rawProps, props, attrs);
	for (const key in instance.propsOptions[0]) if (!(key in props)) props[key] = void 0;
	if (isStateful) instance.props = isSSR ? props : /* @__PURE__ */ shallowReactive(props);
	else if (!instance.type.props) instance.props = attrs;
	else instance.props = props;
	instance.attrs = attrs;
}
function updateProps(instance, rawProps, rawPrevProps, optimized) {
	const { props, attrs, vnode: { patchFlag } } = instance;
	const rawCurrentProps = /* @__PURE__ */ toRaw(props);
	const [options] = instance.propsOptions;
	let hasAttrsChanged = false;
	if ((optimized || patchFlag > 0) && !(patchFlag & 16)) {
		if (patchFlag & 8) {
			const propsToUpdate = instance.vnode.dynamicProps;
			for (let i = 0; i < propsToUpdate.length; i++) {
				let key = propsToUpdate[i];
				if (isEmitListener(instance.emitsOptions, key)) continue;
				const value = rawProps[key];
				if (options) {
					if (hasOwn(attrs, key)) {
						if (value !== attrs[key]) {
							attrs[key] = value;
							hasAttrsChanged = true;
						}
					} else {
						const camelizedKey = camelize(key);
						props[camelizedKey] = resolvePropValue(options, rawCurrentProps, camelizedKey, value, instance, false);
					}
				} else if (value !== attrs[key]) {
					attrs[key] = value;
					hasAttrsChanged = true;
				}
			}
		}
	} else {
		if (setFullProps(instance, rawProps, props, attrs)) hasAttrsChanged = true;
		let kebabKey;
		for (const key in rawCurrentProps) if (!rawProps || !hasOwn(rawProps, key) && ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey))) {
			if (options) {
				if (rawPrevProps && (rawPrevProps[key] !== void 0 || rawPrevProps[kebabKey] !== void 0)) props[key] = resolvePropValue(options, rawCurrentProps, key, void 0, instance, true);
			} else delete props[key];
		}
		if (attrs !== rawCurrentProps) {
			for (const key in attrs) if (!rawProps || !hasOwn(rawProps, key) && true) {
				delete attrs[key];
				hasAttrsChanged = true;
			}
		}
	}
	if (hasAttrsChanged) trigger(instance.attrs, "set", "");
}
function setFullProps(instance, rawProps, props, attrs) {
	const [options, needCastKeys] = instance.propsOptions;
	let hasAttrsChanged = false;
	let rawCastValues;
	if (rawProps) for (let key in rawProps) {
		if (isReservedProp(key)) continue;
		const value = rawProps[key];
		let camelKey;
		if (options && hasOwn(options, camelKey = camelize(key))) {
			if (!needCastKeys || !needCastKeys.includes(camelKey)) props[camelKey] = value;
			else (rawCastValues || (rawCastValues = {}))[camelKey] = value;
		} else if (!isEmitListener(instance.emitsOptions, key)) {
			if (!(key in attrs) || value !== attrs[key]) {
				attrs[key] = value;
				hasAttrsChanged = true;
			}
		}
	}
	if (needCastKeys) {
		const rawCurrentProps = /* @__PURE__ */ toRaw(props);
		const castValues = rawCastValues || EMPTY_OBJ;
		for (let i = 0; i < needCastKeys.length; i++) {
			const key = needCastKeys[i];
			props[key] = resolvePropValue(options, rawCurrentProps, key, castValues[key], instance, !hasOwn(castValues, key));
		}
	}
	return hasAttrsChanged;
}
function resolvePropValue(options, props, key, value, instance, isAbsent) {
	const opt = options[key];
	if (opt != null) {
		const hasDefault = hasOwn(opt, "default");
		if (hasDefault && value === void 0) {
			const defaultValue = opt.default;
			if (opt.type !== Function && !opt.skipFactory && isFunction(defaultValue)) {
				const { propsDefaults } = instance;
				if (key in propsDefaults) value = propsDefaults[key];
				else {
					const reset = setCurrentInstance(instance);
					value = propsDefaults[key] = defaultValue.call(null, props);
					reset();
				}
			} else value = defaultValue;
			if (instance.ce) instance.ce._setProp(key, value);
		}
		if (opt[0]) {
			if (isAbsent && !hasDefault) value = false;
			else if (opt[1] && (value === "" || value === hyphenate(key))) value = true;
		}
	}
	return value;
}
var mixinPropsCache = /* @__PURE__ */ new WeakMap();
function normalizePropsOptions(comp, appContext, asMixin = false) {
	const cache = asMixin ? mixinPropsCache : appContext.propsCache;
	const cached = cache.get(comp);
	if (cached) return cached;
	const raw = comp.props;
	const normalized = {};
	const needCastKeys = [];
	let hasExtends = false;
	if (!isFunction(comp)) {
		const extendProps = (raw2) => {
			hasExtends = true;
			const [props, keys] = normalizePropsOptions(raw2, appContext, true);
			extend(normalized, props);
			if (keys) needCastKeys.push(...keys);
		};
		if (!asMixin && appContext.mixins.length) appContext.mixins.forEach(extendProps);
		if (comp.extends) extendProps(comp.extends);
		if (comp.mixins) comp.mixins.forEach(extendProps);
	}
	if (!raw && !hasExtends) {
		if (isObject(comp)) cache.set(comp, EMPTY_ARR);
		return EMPTY_ARR;
	}
	if (isArray$1(raw)) for (let i = 0; i < raw.length; i++) {
		const normalizedKey = camelize(raw[i]);
		if (validatePropName(normalizedKey)) normalized[normalizedKey] = EMPTY_OBJ;
	}
	else if (raw) for (const key in raw) {
		const normalizedKey = camelize(key);
		if (validatePropName(normalizedKey)) {
			const opt = raw[key];
			const prop = normalized[normalizedKey] = isArray$1(opt) || isFunction(opt) ? { type: opt } : extend({}, opt);
			const propType = prop.type;
			let shouldCast = false;
			let shouldCastTrue = true;
			if (isArray$1(propType)) for (let index = 0; index < propType.length; ++index) {
				const type = propType[index];
				const typeName = isFunction(type) && type.name;
				if (typeName === "Boolean") {
					shouldCast = true;
					break;
				} else if (typeName === "String") shouldCastTrue = false;
			}
			else shouldCast = isFunction(propType) && propType.name === "Boolean";
			prop[0] = shouldCast;
			prop[1] = shouldCastTrue;
			if (shouldCast || hasOwn(prop, "default")) needCastKeys.push(normalizedKey);
		}
	}
	const res = [normalized, needCastKeys];
	if (isObject(comp)) cache.set(comp, res);
	return res;
}
function validatePropName(key) {
	if (key[0] !== "$" && !isReservedProp(key)) return true;
	return false;
}
var isInternalKey = (key) => key === "_" || key === "_ctx" || key === "$stable";
var normalizeSlotValue = (value) => isArray$1(value) ? value.map(normalizeVNode) : [normalizeVNode(value)];
var normalizeSlot$1 = (key, rawSlot, ctx) => {
	if (rawSlot._n) return rawSlot;
	const normalized = withCtx((...args) => {
		return normalizeSlotValue(rawSlot(...args));
	}, ctx);
	normalized._c = false;
	return normalized;
};
var normalizeObjectSlots = (rawSlots, slots, instance) => {
	const ctx = rawSlots._ctx;
	for (const key in rawSlots) {
		if (isInternalKey(key)) continue;
		const value = rawSlots[key];
		if (isFunction(value)) slots[key] = normalizeSlot$1(key, value, ctx);
		else if (value != null) {
			const normalized = normalizeSlotValue(value);
			slots[key] = () => normalized;
		}
	}
};
var normalizeVNodeSlots = (instance, children) => {
	const normalized = normalizeSlotValue(children);
	instance.slots.default = () => normalized;
};
var assignSlots = (slots, children, optimized) => {
	for (const key in children) if (optimized || !isInternalKey(key)) slots[key] = children[key];
};
var initSlots = (instance, children, optimized) => {
	const slots = instance.slots = createInternalObject();
	if (instance.vnode.shapeFlag & 32) {
		const type = children._;
		if (type) {
			assignSlots(slots, children, optimized);
			if (optimized) def(slots, "_", type, true);
		} else normalizeObjectSlots(children, slots);
	} else if (children) normalizeVNodeSlots(instance, children);
};
var updateSlots = (instance, children, optimized) => {
	const { vnode, slots } = instance;
	let needDeletionCheck = true;
	let deletionComparisonTarget = EMPTY_OBJ;
	if (vnode.shapeFlag & 32) {
		const type = children._;
		if (type) {
			if (optimized && type === 1) needDeletionCheck = false;
			else assignSlots(slots, children, optimized);
		} else {
			needDeletionCheck = !children.$stable;
			normalizeObjectSlots(children, slots);
		}
		deletionComparisonTarget = children;
	} else if (children) {
		normalizeVNodeSlots(instance, children);
		deletionComparisonTarget = { default: 1 };
	}
	if (needDeletionCheck) {
		for (const key in slots) if (!isInternalKey(key) && deletionComparisonTarget[key] == null) delete slots[key];
	}
};
var queuePostRenderEffect = queueEffectWithSuspense;
function createRenderer(options) {
	return baseCreateRenderer(options);
}
function baseCreateRenderer(options, createHydrationFns) {
	const target = getGlobalThis();
	target.__VUE__ = true;
	const { insert: hostInsert, remove: hostRemove, patchProp: hostPatchProp, createElement: hostCreateElement, createText: hostCreateText, createComment: hostCreateComment, setText: hostSetText, setElementText: hostSetElementText, parentNode: hostParentNode, nextSibling: hostNextSibling, setScopeId: hostSetScopeId = NOOP, insertStaticContent: hostInsertStaticContent } = options;
	const patch = (n1, n2, container, anchor = null, parentComponent = null, parentSuspense = null, namespace = void 0, slotScopeIds = null, optimized = !!n2.dynamicChildren) => {
		if (n1 === n2) return;
		if (n1 && !isSameVNodeType(n1, n2)) {
			anchor = getNextHostNode(n1);
			unmount(n1, parentComponent, parentSuspense, true);
			n1 = null;
		}
		if (n2.patchFlag === -2) {
			optimized = false;
			n2.dynamicChildren = null;
		}
		if (n2.dynamicChildren && n1 && n1.dynamicChildren && n1.dynamicChildren.hasOnce) {
			if (n2.dynamicChildren === EMPTY_ARR) n2.dynamicChildren = [];
			n2.dynamicChildren.hasOnce = true;
		}
		const { type, ref, shapeFlag } = n2;
		switch (type) {
			case Text:
				processText(n1, n2, container, anchor);
				break;
			case Comment:
				processCommentNode(n1, n2, container, anchor);
				break;
			case Static:
				if (n1 == null) mountStaticNode(n2, container, anchor, namespace);
				break;
			case Fragment:
				processFragment(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
				break;
			default: if (shapeFlag & 1) processElement(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			else if (shapeFlag & 6) processComponent(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			else if (shapeFlag & 64) type.process(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, internals);
			else if (shapeFlag & 128) type.process(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, internals);
		}
		if (ref != null && parentComponent) setRef(ref, n1 && n1.ref, parentSuspense, n2 || n1, !n2);
		else if (ref == null && n1 && n1.ref != null) setRef(n1.ref, null, parentSuspense, n1, true);
	};
	const processText = (n1, n2, container, anchor) => {
		if (n1 == null) hostInsert(n2.el = hostCreateText(n2.children), container, anchor);
		else {
			const el = n2.el = n1.el;
			if (n2.children !== n1.children) hostSetText(el, n2.children);
		}
	};
	const processCommentNode = (n1, n2, container, anchor) => {
		if (n1 == null) hostInsert(n2.el = hostCreateComment(n2.children || ""), container, anchor);
		else n2.el = n1.el;
	};
	const mountStaticNode = (n2, container, anchor, namespace) => {
		[n2.el, n2.anchor] = hostInsertStaticContent(n2.children, container, anchor, namespace, n2.el, n2.anchor);
	};
	const moveStaticNode = ({ el, anchor }, container, nextSibling) => {
		let next;
		while (el && el !== anchor) {
			next = hostNextSibling(el);
			hostInsert(el, container, nextSibling);
			el = next;
		}
		hostInsert(anchor, container, nextSibling);
	};
	const removeStaticNode = ({ el, anchor }) => {
		let next;
		while (el && el !== anchor) {
			next = hostNextSibling(el);
			hostRemove(el);
			el = next;
		}
		hostRemove(anchor);
	};
	const processElement = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
		if (n2.type === "svg") namespace = "svg";
		else if (n2.type === "math") namespace = "mathml";
		if (n1 == null) mountElement(n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
		else {
			const customElement = n1.el && n1.el._isVueCE ? n1.el : null;
			try {
				if (customElement) customElement._beginPatch();
				patchElement(n1, n2, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			} finally {
				if (customElement) customElement._endPatch();
			}
		}
	};
	const mountElement = (vnode, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
		let el;
		let vnodeHook;
		const { props, shapeFlag, transition, dirs } = vnode;
		el = vnode.el = hostCreateElement(vnode.type, namespace, props && props.is, props);
		if (shapeFlag & 8) hostSetElementText(el, vnode.children);
		else if (shapeFlag & 16) mountChildren(vnode.children, el, null, parentComponent, parentSuspense, resolveChildrenNamespace(vnode, namespace), slotScopeIds, optimized);
		if (dirs) invokeDirectiveHook(vnode, null, parentComponent, "created");
		setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent);
		if (props) {
			for (const key in props) if (key !== "value" && !isReservedProp(key)) hostPatchProp(el, key, null, props[key], namespace, parentComponent);
			if ("value" in props) hostPatchProp(el, "value", null, props.value, namespace);
			if (vnodeHook = props.onVnodeBeforeMount) invokeVNodeHook(vnodeHook, parentComponent, vnode);
		}
		if (dirs) invokeDirectiveHook(vnode, null, parentComponent, "beforeMount");
		const needCallTransitionHooks = needTransition(parentSuspense, transition);
		if (needCallTransitionHooks) transition.beforeEnter(el);
		hostInsert(el, container, anchor);
		if ((vnodeHook = props && props.onVnodeMounted) || needCallTransitionHooks || dirs) queuePostRenderEffect(() => {
			try {
				vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
				needCallTransitionHooks && transition.enter(el);
				dirs && invokeDirectiveHook(vnode, null, parentComponent, "mounted");
			} finally {}
		}, parentSuspense);
	};
	const setScopeId = (el, vnode, scopeId, slotScopeIds, parentComponent) => {
		if (scopeId) hostSetScopeId(el, scopeId);
		if (slotScopeIds) for (let i = 0; i < slotScopeIds.length; i++) hostSetScopeId(el, slotScopeIds[i]);
		if (parentComponent) {
			let subTree = parentComponent.subTree;
			if (vnode === subTree || isSuspense(subTree.type) && (subTree.ssContent === vnode || subTree.ssFallback === vnode)) {
				const parentVNode = parentComponent.vnode;
				setScopeId(el, parentVNode, parentVNode.scopeId, parentVNode.slotScopeIds, parentComponent.parent);
			}
		}
	};
	const mountChildren = (children, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, start = 0) => {
		for (let i = start; i < children.length; i++) {
			const child = children[i] = optimized ? cloneIfMounted(children[i]) : normalizeVNode(children[i]);
			patch(null, child, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
		}
	};
	const patchElement = (n1, n2, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
		const el = n2.el = n1.el;
		let { patchFlag, dynamicChildren, dirs } = n2;
		patchFlag |= n1.patchFlag & 16;
		const oldProps = n1.props || EMPTY_OBJ;
		const newProps = n2.props || EMPTY_OBJ;
		let vnodeHook;
		parentComponent && toggleRecurse(parentComponent, false);
		if (vnodeHook = newProps.onVnodeBeforeUpdate) invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
		if (dirs) invokeDirectiveHook(n2, n1, parentComponent, "beforeUpdate");
		parentComponent && toggleRecurse(parentComponent, true);
		if (dynamicChildren && (!n1.dynamicChildren || n1.dynamicChildren.length !== dynamicChildren.length)) {
			patchFlag = 0;
			optimized = false;
			dynamicChildren = null;
		}
		if (oldProps.innerHTML && newProps.innerHTML == null || oldProps.textContent && newProps.textContent == null) hostSetElementText(el, "");
		if (dynamicChildren) patchBlockChildren(n1.dynamicChildren, dynamicChildren, el, parentComponent, parentSuspense, resolveChildrenNamespace(n2, namespace), slotScopeIds);
		else if (!optimized) patchChildren(n1, n2, el, null, parentComponent, parentSuspense, resolveChildrenNamespace(n2, namespace), slotScopeIds, false);
		if (patchFlag > 0) {
			if (patchFlag & 16) patchProps(el, oldProps, newProps, parentComponent, namespace);
			else {
				if (patchFlag & 2) {
					if (oldProps.class !== newProps.class) hostPatchProp(el, "class", null, newProps.class, namespace);
				}
				if (patchFlag & 4) hostPatchProp(el, "style", oldProps.style, newProps.style, namespace);
				if (patchFlag & 8) {
					const propsToUpdate = n2.dynamicProps;
					for (let i = 0; i < propsToUpdate.length; i++) {
						const key = propsToUpdate[i];
						const prev = oldProps[key];
						const next = newProps[key];
						if (next !== prev || key === "value") hostPatchProp(el, key, prev, next, namespace, parentComponent);
					}
				}
			}
			if (patchFlag & 1) {
				if (n1.children !== n2.children) hostSetElementText(el, n2.children);
			}
		} else if (!optimized && dynamicChildren == null) patchProps(el, oldProps, newProps, parentComponent, namespace);
		if ((vnodeHook = newProps.onVnodeUpdated) || dirs) queuePostRenderEffect(() => {
			vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
			dirs && invokeDirectiveHook(n2, n1, parentComponent, "updated");
		}, parentSuspense);
	};
	const patchBlockChildren = (oldChildren, newChildren, fallbackContainer, parentComponent, parentSuspense, namespace, slotScopeIds) => {
		for (let i = 0; i < newChildren.length; i++) {
			const oldVNode = oldChildren[i];
			const newVNode = newChildren[i];
			const oldEl = oldVNode.el || resolveAsyncComponentPlaceholder(oldVNode);
			const container = oldEl && (oldVNode.type === Fragment || !isSameVNodeType(oldVNode, newVNode) || oldVNode.shapeFlag & 198) ? hostParentNode(oldEl) : fallbackContainer;
			patch(oldVNode, newVNode, container, null, parentComponent, parentSuspense, namespace, slotScopeIds, true);
		}
	};
	const patchProps = (el, oldProps, newProps, parentComponent, namespace) => {
		if (oldProps !== newProps) {
			if (oldProps !== EMPTY_OBJ) {
				for (const key in oldProps) if (!isReservedProp(key) && !(key in newProps)) hostPatchProp(el, key, oldProps[key], null, namespace, parentComponent);
			}
			for (const key in newProps) {
				if (isReservedProp(key)) continue;
				const next = newProps[key];
				const prev = oldProps[key];
				if (next !== prev && key !== "value") hostPatchProp(el, key, prev, next, namespace, parentComponent);
			}
			if ("value" in newProps) hostPatchProp(el, "value", oldProps.value, newProps.value, namespace);
		}
	};
	const processFragment = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
		const fragmentStartAnchor = n2.el = n1 ? n1.el : hostCreateText("");
		const fragmentEndAnchor = n2.anchor = n1 ? n1.anchor : hostCreateText("");
		let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2;
		if (fragmentSlotScopeIds) slotScopeIds = slotScopeIds ? slotScopeIds.concat(fragmentSlotScopeIds) : fragmentSlotScopeIds;
		if (n1 == null) {
			hostInsert(fragmentStartAnchor, container, anchor);
			hostInsert(fragmentEndAnchor, container, anchor);
			mountChildren(n2.children || [], container, fragmentEndAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
		} else if (patchFlag > 0 && patchFlag & 64 && dynamicChildren && n1.dynamicChildren && n1.dynamicChildren.length === dynamicChildren.length) {
			patchBlockChildren(n1.dynamicChildren, dynamicChildren, container, parentComponent, parentSuspense, namespace, slotScopeIds);
			if (n2.key != null || parentComponent && n2 === parentComponent.subTree) traverseStaticChildren(n1, n2, true);
		} else patchChildren(n1, n2, container, fragmentEndAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
	};
	const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
		n2.slotScopeIds = slotScopeIds;
		if (n1 == null) {
			if (n2.shapeFlag & 512) parentComponent.ctx.activate(n2, container, anchor, namespace, optimized);
			else mountComponent(n2, container, anchor, parentComponent, parentSuspense, namespace, optimized);
		} else updateComponent(n1, n2, optimized);
	};
	const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, namespace, optimized) => {
		const instance = initialVNode.component = createComponentInstance(initialVNode, parentComponent, parentSuspense);
		if (isKeepAlive(initialVNode)) instance.ctx.renderer = internals;
		setupComponent(instance, false, optimized);
		if (instance.asyncDep) {
			parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect, optimized, namespace);
			if (!initialVNode.el) {
				const placeholder = instance.subTree = createVNode(Comment);
				processCommentNode(null, placeholder, container, anchor);
				initialVNode.placeholder = placeholder.el;
			}
		} else setupRenderEffect(instance, initialVNode, container, anchor, parentSuspense, namespace, optimized);
	};
	const updateComponent = (n1, n2, optimized) => {
		const instance = n2.component = n1.component;
		if (shouldUpdateComponent(n1, n2, optimized)) {
			if (instance.asyncDep && !instance.asyncResolved) {
				n2.el = n1.el;
				n2.placeholder = n1.placeholder;
				updateComponentPreRender(instance, n2, optimized);
				return;
			} else {
				instance.next = n2;
				instance.update();
			}
		} else {
			n2.el = n1.el;
			n2.placeholder = n1.placeholder;
			instance.vnode = n2;
		}
	};
	const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, namespace, optimized) => {
		const componentUpdateFn = () => {
			if (!instance.isMounted) {
				let vnodeHook;
				const { el, props } = initialVNode;
				const { bm, m, parent, root, type } = instance;
				const isAsyncWrapperVNode = isAsyncWrapper(initialVNode);
				toggleRecurse(instance, false);
				if (bm) invokeArrayFns(bm);
				if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeBeforeMount)) invokeVNodeHook(vnodeHook, parent, initialVNode);
				toggleRecurse(instance, true);
				if (el && hydrateNode) {
					const hydrateSubTree = () => {
						instance.subTree = renderComponentRoot(instance);
						hydrateNode(el, instance.subTree, instance, parentSuspense, null);
					};
					if (isAsyncWrapperVNode && type.__asyncHydrate) type.__asyncHydrate(el, instance, hydrateSubTree);
					else hydrateSubTree();
				} else {
					if (root.ce && root.ce._hasShadowRoot()) root.ce._injectChildStyle(type, instance.parent ? instance.parent.type : void 0);
					const subTree = instance.subTree = renderComponentRoot(instance);
					patch(null, subTree, container, anchor, instance, parentSuspense, namespace);
					initialVNode.el = subTree.el;
				}
				if (m) queuePostRenderEffect(m, parentSuspense);
				if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeMounted)) {
					const scopedInitialVNode = initialVNode;
					queuePostRenderEffect(() => invokeVNodeHook(vnodeHook, parent, scopedInitialVNode), parentSuspense);
				}
				if (initialVNode.shapeFlag & 256 || parent && isAsyncWrapper(parent.vnode) && parent.vnode.shapeFlag & 256) instance.a && queuePostRenderEffect(instance.a, parentSuspense);
				instance.isMounted = true;
				initialVNode = container = anchor = null;
			} else {
				let { next, bu, u, parent, vnode } = instance;
				{
					const nonHydratedAsyncRoot = locateNonHydratedAsyncRoot(instance);
					if (nonHydratedAsyncRoot) {
						if (next) {
							next.el = vnode.el;
							updateComponentPreRender(instance, next, optimized);
						}
						nonHydratedAsyncRoot.asyncDep.then(() => {
							queuePostRenderEffect(() => {
								if (!instance.isUnmounted) update();
							}, parentSuspense);
						});
						return;
					}
				}
				let originNext = next;
				let vnodeHook;
				toggleRecurse(instance, false);
				if (next) {
					next.el = vnode.el;
					updateComponentPreRender(instance, next, optimized);
				} else next = vnode;
				if (bu) invokeArrayFns(bu);
				if (vnodeHook = next.props && next.props.onVnodeBeforeUpdate) invokeVNodeHook(vnodeHook, parent, next, vnode);
				toggleRecurse(instance, true);
				const nextTree = renderComponentRoot(instance);
				const prevTree = instance.subTree;
				instance.subTree = nextTree;
				patch(prevTree, nextTree, hostParentNode(prevTree.el), getNextHostNode(prevTree), instance, parentSuspense, namespace);
				next.el = nextTree.el;
				if (originNext === null) updateHOCHostEl(instance, nextTree.el);
				if (u) queuePostRenderEffect(u, parentSuspense);
				if (vnodeHook = next.props && next.props.onVnodeUpdated) queuePostRenderEffect(() => invokeVNodeHook(vnodeHook, parent, next, vnode), parentSuspense);
			}
		};
		instance.scope.on();
		const effect = instance.effect = new ReactiveEffect(componentUpdateFn);
		instance.scope.off();
		const update = instance.update = effect.run.bind(effect);
		const job = instance.job = effect.runIfDirty.bind(effect);
		job.i = instance;
		job.id = instance.uid;
		effect.scheduler = () => queueJob(job);
		toggleRecurse(instance, true);
		update();
	};
	const updateComponentPreRender = (instance, nextVNode, optimized) => {
		nextVNode.component = instance;
		const prevProps = instance.vnode.props;
		instance.vnode = nextVNode;
		instance.next = null;
		updateProps(instance, nextVNode.props, prevProps, optimized);
		updateSlots(instance, nextVNode.children, optimized);
		pauseTracking();
		flushPreFlushCbs(instance);
		resetTracking();
	};
	const patchChildren = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized = false) => {
		const c1 = n1 && n1.children;
		const prevShapeFlag = n1 ? n1.shapeFlag : 0;
		const c2 = n2.children;
		const { patchFlag, shapeFlag } = n2;
		if (patchFlag > 0) {
			if (patchFlag & 128) {
				patchKeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
				return;
			} else if (patchFlag & 256) {
				patchUnkeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
				return;
			}
		}
		if (shapeFlag & 8) {
			if (prevShapeFlag & 16) unmountChildren(c1, parentComponent, parentSuspense);
			if (c2 !== c1) hostSetElementText(container, c2);
		} else if (prevShapeFlag & 16) {
			if (shapeFlag & 16) patchKeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			else unmountChildren(c1, parentComponent, parentSuspense, true);
		} else {
			if (prevShapeFlag & 8) hostSetElementText(container, "");
			if (shapeFlag & 16) mountChildren(c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
		}
	};
	const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
		c1 = c1 || EMPTY_ARR;
		c2 = c2 || EMPTY_ARR;
		const oldLength = c1.length;
		const newLength = c2.length;
		const commonLength = Math.min(oldLength, newLength);
		let i = 0;
		for (; i < commonLength; i++) {
			const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
			patch(c1[i], nextChild, container, null, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
		}
		if (oldLength > newLength) unmountChildren(c1, parentComponent, parentSuspense, true, false, commonLength);
		else mountChildren(c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, commonLength);
	};
	const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
		let i = 0;
		const l2 = c2.length;
		let e1 = c1.length - 1;
		let e2 = l2 - 1;
		while (i <= e1 && i <= e2) {
			const n1 = c1[i];
			const n2 = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
			if (isSameVNodeType(n1, n2)) patch(n1, n2, container, null, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			else break;
			i++;
		}
		while (i <= e1 && i <= e2) {
			const n1 = c1[e1];
			const n2 = c2[e2] = optimized ? cloneIfMounted(c2[e2]) : normalizeVNode(c2[e2]);
			if (isSameVNodeType(n1, n2)) patch(n1, n2, container, null, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			else break;
			e1--;
			e2--;
		}
		if (i > e1) {
			if (i <= e2) {
				const nextPos = e2 + 1;
				const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;
				while (i <= e2) {
					patch(null, c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]), container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
					i++;
				}
			}
		} else if (i > e2) while (i <= e1) {
			unmount(c1[i], parentComponent, parentSuspense, true);
			i++;
		}
		else {
			const s1 = i;
			const s2 = i;
			const keyToNewIndexMap = /* @__PURE__ */ new Map();
			for (i = s2; i <= e2; i++) {
				const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
				if (nextChild.key != null) keyToNewIndexMap.set(nextChild.key, i);
			}
			let j;
			let patched = 0;
			const toBePatched = e2 - s2 + 1;
			let moved = false;
			let maxNewIndexSoFar = 0;
			const newIndexToOldIndexMap = new Array(toBePatched);
			for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0;
			for (i = s1; i <= e1; i++) {
				const prevChild = c1[i];
				if (patched >= toBePatched) {
					unmount(prevChild, parentComponent, parentSuspense, true);
					continue;
				}
				let newIndex;
				if (prevChild.key != null) newIndex = keyToNewIndexMap.get(prevChild.key);
				else for (j = s2; j <= e2; j++) if (newIndexToOldIndexMap[j - s2] === 0 && isSameVNodeType(prevChild, c2[j])) {
					newIndex = j;
					break;
				}
				if (newIndex === void 0) unmount(prevChild, parentComponent, parentSuspense, true);
				else {
					newIndexToOldIndexMap[newIndex - s2] = i + 1;
					if (newIndex >= maxNewIndexSoFar) maxNewIndexSoFar = newIndex;
					else moved = true;
					patch(prevChild, c2[newIndex], container, null, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
					patched++;
				}
			}
			const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : EMPTY_ARR;
			j = increasingNewIndexSequence.length - 1;
			for (i = toBePatched - 1; i >= 0; i--) {
				const nextIndex = s2 + i;
				const nextChild = c2[nextIndex];
				const anchorVNode = c2[nextIndex + 1];
				const anchor = nextIndex + 1 < l2 ? anchorVNode.el || resolveAsyncComponentPlaceholder(anchorVNode) : parentAnchor;
				if (newIndexToOldIndexMap[i] === 0) patch(null, nextChild, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
				else if (moved) {
					if (j < 0 || i !== increasingNewIndexSequence[j]) move(nextChild, container, anchor, 2);
					else j--;
				}
			}
		}
	};
	const move = (vnode, container, anchor, moveType, parentSuspense = null) => {
		const { el, type, transition, children, shapeFlag } = vnode;
		if (shapeFlag & 6) {
			move(vnode.component.subTree, container, anchor, moveType);
			return;
		}
		if (shapeFlag & 128) {
			vnode.suspense.move(container, anchor, moveType);
			return;
		}
		if (shapeFlag & 64) {
			type.move(vnode, container, anchor, internals);
			return;
		}
		if (type === Fragment) {
			hostInsert(el, container, anchor);
			for (let i = 0; i < children.length; i++) move(children[i], container, anchor, moveType);
			hostInsert(vnode.anchor, container, anchor);
			return;
		}
		if (type === Static) {
			moveStaticNode(vnode, container, anchor);
			return;
		}
		if (moveType !== 2 && shapeFlag & 1 && transition) {
			if (moveType === 0) {
				if (transition.persisted && !el[leaveCbKey]) hostInsert(el, container, anchor);
				else {
					transition.beforeEnter(el);
					hostInsert(el, container, anchor);
					queuePostRenderEffect(() => transition.enter(el), parentSuspense);
				}
			} else {
				const { leave, delayLeave, afterLeave } = transition;
				const remove2 = () => {
					if (vnode.ctx.isUnmounted) hostRemove(el);
					else hostInsert(el, container, anchor);
				};
				const performLeave = () => {
					const wasLeaving = el._isLeaving || !!el[leaveCbKey];
					if (el._isLeaving) el[leaveCbKey](true);
					if (transition.persisted && !wasLeaving) remove2();
					else leave(el, () => {
						remove2();
						afterLeave && afterLeave();
					});
				};
				if (delayLeave) delayLeave(el, remove2, performLeave);
				else performLeave();
			}
		} else hostInsert(el, container, anchor);
	};
	const unmount = (vnode, parentComponent, parentSuspense, doRemove = false, optimized = false) => {
		const { type, props, ref, children, dynamicChildren, shapeFlag, patchFlag, dirs, cacheIndex, memo } = vnode;
		if (patchFlag === -2 || dynamicChildren && dynamicChildren.hasOnce) optimized = false;
		if (ref != null) {
			pauseTracking();
			setRef(ref, null, parentSuspense, vnode, true);
			resetTracking();
		}
		if (cacheIndex != null && (!vnode.ctx || vnode.ctx === parentComponent)) parentComponent.renderCache[cacheIndex] = void 0;
		if (shapeFlag & 256) {
			parentComponent.ctx.deactivate(vnode);
			return;
		}
		const shouldInvokeDirs = shapeFlag & 1 && dirs;
		const shouldInvokeVnodeHook = !isAsyncWrapper(vnode);
		let vnodeHook;
		if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeBeforeUnmount)) invokeVNodeHook(vnodeHook, parentComponent, vnode);
		if (shapeFlag & 6) unmountComponent(vnode.component, parentSuspense, doRemove);
		else {
			if (shapeFlag & 128) {
				vnode.suspense.unmount(parentSuspense, doRemove);
				return;
			}
			if (shouldInvokeDirs) invokeDirectiveHook(vnode, null, parentComponent, "beforeUnmount");
			if (shapeFlag & 64) vnode.type.remove(vnode, parentComponent, parentSuspense, internals, doRemove);
			else if (dynamicChildren && !dynamicChildren.hasOnce && (type !== Fragment || patchFlag > 0 && patchFlag & 64)) unmountChildren(dynamicChildren, parentComponent, parentSuspense, false, true);
			else if (type === Fragment && patchFlag & 384 || !optimized && shapeFlag & 16) unmountChildren(children, parentComponent, parentSuspense);
			if (doRemove) remove(vnode);
		}
		const shouldInvalidateMemo = memo != null && cacheIndex == null;
		if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeUnmounted) || shouldInvokeDirs || shouldInvalidateMemo) queuePostRenderEffect(() => {
			vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
			shouldInvokeDirs && invokeDirectiveHook(vnode, null, parentComponent, "unmounted");
			if (shouldInvalidateMemo) vnode.el = null;
		}, parentSuspense);
	};
	const remove = (vnode) => {
		const { type, el, anchor, transition } = vnode;
		const isFragment = type === Fragment;
		if (isFragment && !transition) {
			removeFragment(el, anchor);
			return;
		}
		if (type === Static) {
			removeStaticNode(vnode);
			if (transition && !transition.persisted && transition.afterLeave) transition.afterLeave();
			return;
		}
		const leavingNode = isFragment ? getTransitionRoot(vnode) : vnode;
		const performRemove = () => {
			if (isFragment) {
				if (hostParentNode(el)) removeFragment(el, anchor);
			} else hostRemove(el);
			if (transition && !transition.persisted && transition.afterLeave) transition.afterLeave();
		};
		if (leavingNode && leavingNode.shapeFlag & 1 && transition && !transition.persisted) {
			const { leave, delayLeave } = transition;
			const leavingEl = leavingNode.el;
			const performLeave = () => leave(leavingEl, performRemove);
			if (delayLeave) delayLeave(leavingEl, performRemove, performLeave);
			else performLeave();
		} else performRemove();
	};
	const removeFragment = (cur, end) => {
		let next;
		while (cur !== end) {
			next = hostNextSibling(cur);
			hostRemove(cur);
			cur = next;
		}
		hostRemove(end);
	};
	const unmountComponent = (instance, parentSuspense, doRemove) => {
		const { bum, scope, job, subTree, um, m, a } = instance;
		invalidateMount(m);
		invalidateMount(a);
		if (bum) invokeArrayFns(bum);
		scope.stop();
		if (job) {
			job.flags |= 8;
			unmount(subTree, instance, parentSuspense, doRemove);
		} else if (instance.vnode.el && subTree) {
			subTree.transition = instance.vnode.transition;
			unmount(subTree, instance, parentSuspense, doRemove);
		}
		if (um) queuePostRenderEffect(um, parentSuspense);
		queuePostRenderEffect(() => {
			instance.isUnmounted = true;
		}, parentSuspense);
	};
	const unmountChildren = (children, parentComponent, parentSuspense, doRemove = false, optimized = false, start = 0) => {
		for (let i = start; i < children.length; i++) unmount(children[i], parentComponent, parentSuspense, doRemove, optimized);
	};
	const getNextHostNode = (vnode) => {
		if (vnode.shapeFlag & 6) return getNextHostNode(vnode.component.subTree);
		if (vnode.shapeFlag & 128) return vnode.suspense.next();
		const el = hostNextSibling(vnode.anchor || vnode.el);
		const teleportEnd = el && el[TeleportEndKey];
		return teleportEnd ? hostNextSibling(teleportEnd) : el;
	};
	const render = (vnode, container, namespace) => {
		flushOnAppMount(() => {
			if (vnode == null) {
				if (container._vnode) unmount(container._vnode, null, null, true);
			} else patch(container._vnode || null, vnode, container, null, null, null, namespace);
			container._vnode = vnode;
		}, vnode && container._vnode ? void 0 : vnode && vnode.component ? vnode.component.uid : getNextUid());
	};
	const internals = {
		p: patch,
		um: unmount,
		m: move,
		r: remove,
		mt: mountComponent,
		mc: mountChildren,
		pc: patchChildren,
		pbc: patchBlockChildren,
		n: getNextHostNode,
		o: options
	};
	let hydrate;
	let hydrateNode;
	if (createHydrationFns) [hydrate, hydrateNode] = createHydrationFns(internals);
	return {
		render,
		hydrate,
		createApp: createAppAPI(render, hydrate)
	};
}
function resolveChildrenNamespace({ type, props }, currentNamespace) {
	return currentNamespace === "svg" && type === "foreignObject" || currentNamespace === "mathml" && type === "annotation-xml" && props && props.encoding && props.encoding.includes("html") ? void 0 : currentNamespace;
}
function toggleRecurse({ effect, job }, allowed) {
	if (allowed) {
		effect.flags |= 32;
		job.flags |= 4;
	} else {
		effect.flags &= -33;
		job.flags &= -5;
	}
}
function needTransition(parentSuspense, transition) {
	return (!parentSuspense || parentSuspense && !parentSuspense.pendingBranch) && transition && !transition.persisted;
}
function traverseStaticChildren(n1, n2, shallow = false) {
	const ch1 = n1.children;
	const ch2 = n2.children;
	if (isArray$1(ch1) && isArray$1(ch2)) for (let i = 0; i < ch1.length; i++) {
		const c1 = ch1[i];
		let c2 = ch2[i];
		if (c2.shapeFlag & 1 && !c2.dynamicChildren) {
			if (c2.patchFlag <= 0 || c2.patchFlag === 32) {
				c2 = ch2[i] = cloneIfMounted(ch2[i]);
				c2.el = c1.el;
			}
			if (!shallow && c2.patchFlag !== -2) traverseStaticChildren(c1, c2);
		}
		if (c2.type === Text) {
			if (c2.patchFlag === -1) c2 = ch2[i] = cloneIfMounted(c2);
			c2.el = c1.el;
		}
		if (c2.type === Comment && !c2.el) c2.el = c1.el;
	}
}
function getSequence(arr) {
	const p = arr.slice();
	const result = [0];
	let i, j, u, v, c;
	const len = arr.length;
	for (i = 0; i < len; i++) {
		const arrI = arr[i];
		if (arrI !== 0) {
			j = result[result.length - 1];
			if (arr[j] < arrI) {
				p[i] = j;
				result.push(i);
				continue;
			}
			u = 0;
			v = result.length - 1;
			while (u < v) {
				c = u + v >> 1;
				if (arr[result[c]] < arrI) u = c + 1;
				else v = c;
			}
			if (arrI < arr[result[u]]) {
				if (u > 0) p[i] = result[u - 1];
				result[u] = i;
			}
		}
	}
	u = result.length;
	v = result[u - 1];
	while (u-- > 0) {
		result[u] = v;
		v = p[v];
	}
	return result;
}
function locateNonHydratedAsyncRoot(instance) {
	const subComponent = instance.subTree.component;
	if (subComponent) {
		if (subComponent.asyncDep && !subComponent.asyncResolved) return subComponent;
		else return locateNonHydratedAsyncRoot(subComponent);
	}
}
function invalidateMount(hooks) {
	if (hooks) for (let i = 0; i < hooks.length; i++) hooks[i].flags |= 8;
}
function resolveAsyncComponentPlaceholder(anchorVnode) {
	if (anchorVnode.placeholder) return anchorVnode.placeholder;
	const instance = anchorVnode.component;
	if (instance) return resolveAsyncComponentPlaceholder(instance.subTree);
	return null;
}
var isSuspense = (type) => type.__isSuspense;
function queueEffectWithSuspense(fn, suspense) {
	if (suspense && suspense.pendingBranch) {
		if (isArray$1(fn)) suspense.effects.push(...fn);
		else suspense.effects.push(fn);
	} else queuePostFlushCb(fn);
}
var Fragment = /* @__PURE__ */ Symbol.for("v-fgt");
var Text = /* @__PURE__ */ Symbol.for("v-txt");
var Comment = /* @__PURE__ */ Symbol.for("v-cmt");
var Static = /* @__PURE__ */ Symbol.for("v-stc");
var blockStack = [];
var currentBlock = null;
function openBlock(disableTracking = false) {
	blockStack.push(currentBlock = disableTracking ? null : []);
}
function closeBlock() {
	blockStack.pop();
	currentBlock = blockStack[blockStack.length - 1] || null;
}
var isBlockTreeEnabled = 1;
function setBlockTracking(value, inVOnce = false) {
	isBlockTreeEnabled += value;
	if (value < 0 && currentBlock && inVOnce) currentBlock.hasOnce = true;
}
function setupBlock(vnode) {
	vnode.dynamicChildren = isBlockTreeEnabled > 0 ? currentBlock || EMPTY_ARR : null;
	closeBlock();
	if (isBlockTreeEnabled > 0 && currentBlock) currentBlock.push(vnode);
	return vnode;
}
function createElementBlock(type, props, children, patchFlag, dynamicProps, shapeFlag) {
	return setupBlock(createBaseVNode(type, props, children, patchFlag, dynamicProps, shapeFlag, true));
}
function createBlock(type, props, children, patchFlag, dynamicProps) {
	return setupBlock(createVNode(type, props, children, patchFlag, dynamicProps, true));
}
function isVNode(value) {
	return value ? value.__v_isVNode === true : false;
}
function isSameVNodeType(n1, n2) {
	return n1.type === n2.type && n1.key === n2.key;
}
var normalizeKey = ({ key }) => key != null ? key : null;
var normalizeRef = ({ ref, ref_key, ref_for }) => {
	if (typeof ref === "number") ref = "" + ref;
	return ref != null ? isString(ref) || /* @__PURE__ */ isRef(ref) || isFunction(ref) ? {
		i: currentRenderingInstance,
		r: ref,
		k: ref_key,
		f: !!ref_for
	} : ref : null;
};
function createBaseVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, shapeFlag = type === Fragment ? 0 : 1, isBlockNode = false, needFullChildrenNormalization = false) {
	const vnode = {
		__v_isVNode: true,
		__v_skip: true,
		type,
		props,
		key: props && normalizeKey(props),
		ref: props && normalizeRef(props),
		scopeId: currentScopeId,
		slotScopeIds: null,
		children,
		component: null,
		suspense: null,
		ssContent: null,
		ssFallback: null,
		dirs: null,
		transition: null,
		el: null,
		anchor: null,
		target: null,
		targetStart: null,
		targetAnchor: null,
		staticCount: 0,
		shapeFlag,
		patchFlag,
		dynamicProps,
		dynamicChildren: null,
		appContext: null,
		ctx: currentRenderingInstance
	};
	if (needFullChildrenNormalization) {
		normalizeChildren(vnode, children);
		if (shapeFlag & 128) type.normalize(vnode);
	} else if (children) vnode.shapeFlag |= isString(children) ? 8 : 16;
	if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock && (vnode.patchFlag > 0 || shapeFlag & 6) && vnode.patchFlag !== 32) currentBlock.push(vnode);
	return vnode;
}
var createVNode = _createVNode;
function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
	if (!type || type === NULL_DYNAMIC_COMPONENT) type = Comment;
	if (isVNode(type)) {
		const cloned = cloneVNode(type, props, true);
		if (children) normalizeChildren(cloned, children);
		if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
			if (cloned.shapeFlag & 6) currentBlock[currentBlock.indexOf(type)] = cloned;
			else currentBlock.push(cloned);
		}
		cloned.patchFlag = -2;
		return cloned;
	}
	if (isClassComponent(type)) type = type.__vccOpts;
	if (props) {
		props = guardReactiveProps(props);
		let { class: klass, style } = props;
		if (klass && !isString(klass)) props.class = normalizeClass(klass);
		if (isObject(style)) {
			if (/* @__PURE__ */ isProxy(style) && !isArray$1(style)) style = extend({}, style);
			props.style = normalizeStyle(style);
		}
	}
	const shapeFlag = isString(type) ? 1 : isSuspense(type) ? 128 : isTeleport(type) ? 64 : isObject(type) ? 4 : isFunction(type) ? 2 : 0;
	return createBaseVNode(type, props, children, patchFlag, dynamicProps, shapeFlag, isBlockNode, true);
}
function guardReactiveProps(props) {
	if (!props) return null;
	return /* @__PURE__ */ isProxy(props) || isInternalObject(props) ? extend({}, props) : props;
}
function cloneVNode(vnode, extraProps, mergeRef = false, cloneTransition = false) {
	const { props, ref, patchFlag, children, transition } = vnode;
	const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props;
	const cloned = {
		__v_isVNode: true,
		__v_skip: true,
		type: vnode.type,
		props: mergedProps,
		key: mergedProps && normalizeKey(mergedProps),
		ref: extraProps && extraProps.ref ? mergeRef && ref ? isArray$1(ref) ? ref.concat(normalizeRef(extraProps)) : [ref, normalizeRef(extraProps)] : normalizeRef(extraProps) : ref,
		scopeId: vnode.scopeId,
		slotScopeIds: vnode.slotScopeIds,
		children,
		target: vnode.target,
		targetStart: vnode.targetStart,
		targetAnchor: vnode.targetAnchor,
		staticCount: vnode.staticCount,
		shapeFlag: vnode.shapeFlag,
		patchFlag: extraProps && vnode.type !== Fragment ? patchFlag === -1 ? 16 : patchFlag | 16 : patchFlag,
		dynamicProps: vnode.dynamicProps,
		dynamicChildren: vnode.dynamicChildren,
		appContext: vnode.appContext,
		dirs: vnode.dirs,
		transition,
		component: vnode.component,
		suspense: vnode.suspense,
		ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
		ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
		placeholder: vnode.placeholder,
		el: vnode.el,
		anchor: vnode.anchor,
		ctx: vnode.ctx,
		ce: vnode.ce,
		cacheIndex: vnode.cacheIndex
	};
	if (transition && cloneTransition) setTransitionHooks(cloned, transition.clone(cloned));
	return cloned;
}
function createTextVNode(text = " ", flag = 0) {
	return createVNode(Text, null, text, flag);
}
function createStaticVNode(content, numberOfNodes) {
	const vnode = createVNode(Static, null, content);
	vnode.staticCount = numberOfNodes;
	return vnode;
}
function createCommentVNode(text = "", asBlock = false) {
	return asBlock ? (openBlock(), createBlock(Comment, null, text)) : createVNode(Comment, null, text);
}
function normalizeVNode(child) {
	if (child == null || typeof child === "boolean") return createVNode(Comment);
	else if (isArray$1(child)) return createVNode(Fragment, null, child.slice());
	else if (isVNode(child)) return cloneIfMounted(child);
	else return createVNode(Text, null, String(child));
}
function cloneIfMounted(child) {
	return child.el === null && child.patchFlag !== -1 || child.memo ? child : cloneVNode(child);
}
function normalizeChildren(vnode, children) {
	let type = 0;
	const { shapeFlag } = vnode;
	if (children == null) children = null;
	else if (isArray$1(children)) type = 16;
	else if (typeof children === "object") {
		if (shapeFlag & 65) {
			const slot = children.default;
			if (slot) {
				slot._c && (slot._d = false);
				normalizeChildren(vnode, slot());
				slot._c && (slot._d = true);
			}
			return;
		} else {
			type = 32;
			const slotFlag = children._;
			if (!slotFlag && !isInternalObject(children)) children._ctx = currentRenderingInstance;
			else if (slotFlag === 3 && currentRenderingInstance) {
				if (currentRenderingInstance.slots._ === 1) children._ = 1;
				else {
					children._ = 2;
					vnode.patchFlag |= 1024;
				}
			}
		}
	} else if (isFunction(children)) {
		if (shapeFlag & 65) {
			normalizeChildren(vnode, { default: children });
			return;
		}
		children = {
			default: children,
			_ctx: currentRenderingInstance
		};
		type = 32;
	} else {
		children = String(children);
		if (shapeFlag & 64) {
			type = 16;
			children = [createTextVNode(children)];
		} else type = 8;
	}
	vnode.children = children;
	vnode.shapeFlag |= type;
}
function mergeProps(...args) {
	const ret = {};
	for (let i = 0; i < args.length; i++) {
		const toMerge = args[i];
		for (const key in toMerge) if (key === "class") {
			if (ret.class !== toMerge.class) ret.class = normalizeClass([ret.class, toMerge.class]);
		} else if (key === "style") ret.style = normalizeStyle([ret.style, toMerge.style]);
		else if (isOn(key)) {
			const existing = ret[key];
			const incoming = toMerge[key];
			if (incoming && existing !== incoming && !(isArray$1(existing) && existing.includes(incoming))) ret[key] = existing ? [].concat(existing, incoming) : incoming;
			else if (incoming == null && existing == null && !isModelListener(key)) ret[key] = incoming;
		} else if (key !== "") ret[key] = toMerge[key];
	}
	return ret;
}
function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
	callWithAsyncErrorHandling(hook, instance, 7, [vnode, prevVNode]);
}
var emptyAppContext = createAppContext();
var uid = 0;
function getNextUid() {
	return uid;
}
function createComponentInstance(vnode, parent, suspense) {
	const type = vnode.type;
	const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext;
	const instance = {
		uid: uid++,
		vnode,
		type,
		parent,
		appContext,
		root: null,
		next: null,
		subTree: null,
		effect: null,
		update: null,
		job: null,
		scope: new EffectScope(true),
		render: null,
		proxy: null,
		exposed: null,
		exposeProxy: null,
		withProxy: null,
		provides: parent ? parent.provides : Object.create(appContext.provides),
		ids: parent ? parent.ids : [
			"",
			0,
			0
		],
		accessCache: null,
		renderCache: [],
		components: null,
		directives: null,
		propsOptions: normalizePropsOptions(type, appContext),
		emitsOptions: normalizeEmitsOptions(type, appContext),
		emit: null,
		emitted: null,
		propsDefaults: EMPTY_OBJ,
		inheritAttrs: type.inheritAttrs,
		ctx: EMPTY_OBJ,
		data: EMPTY_OBJ,
		props: EMPTY_OBJ,
		attrs: EMPTY_OBJ,
		slots: EMPTY_OBJ,
		refs: EMPTY_OBJ,
		setupState: EMPTY_OBJ,
		setupContext: null,
		suspense,
		suspenseId: suspense ? suspense.pendingId : 0,
		asyncDep: null,
		asyncResolved: false,
		isMounted: false,
		isUnmounted: false,
		isDeactivated: false,
		bc: null,
		c: null,
		bm: null,
		m: null,
		bu: null,
		u: null,
		um: null,
		bum: null,
		da: null,
		a: null,
		rtg: null,
		rtc: null,
		ec: null,
		sp: null
	};
	instance.ctx = { _: instance };
	instance.root = parent ? parent.root : instance;
	instance.emit = emit.bind(null, instance);
	if (vnode.ce) vnode.ce(instance);
	return instance;
}
var currentInstance = null;
var getCurrentInstance = () => currentInstance || currentRenderingInstance;
var internalSetCurrentInstance;
var setInSSRSetupState;
{
	const g = getGlobalThis();
	const registerGlobalSetter = (key, setter) => {
		let setters;
		if (!(setters = g[key])) setters = g[key] = [];
		setters.push(setter);
		return (v) => {
			if (setters.length > 1) setters.forEach((set) => set(v));
			else setters[0](v);
		};
	};
	internalSetCurrentInstance = registerGlobalSetter(`__VUE_INSTANCE_SETTERS__`, (v) => currentInstance = v);
	setInSSRSetupState = registerGlobalSetter(`__VUE_SSR_SETTERS__`, (v) => isInSSRComponentSetup = v);
}
var setCurrentInstance = (instance) => {
	const prev = currentInstance;
	internalSetCurrentInstance(instance);
	instance.scope.on();
	return () => {
		instance.scope.off();
		internalSetCurrentInstance(prev);
	};
};
var unsetCurrentInstance = () => {
	currentInstance && currentInstance.scope.off();
	internalSetCurrentInstance(null);
};
function isStatefulComponent(instance) {
	return instance.vnode.shapeFlag & 4;
}
var isInSSRComponentSetup = false;
function setupComponent(instance, isSSR = false, optimized = false) {
	isSSR && setInSSRSetupState(isSSR);
	const { props, children } = instance.vnode;
	const isStateful = isStatefulComponent(instance);
	initProps(instance, props, isStateful, isSSR);
	initSlots(instance, children, optimized || isSSR);
	const setupResult = isStateful ? setupStatefulComponent(instance, isSSR) : void 0;
	isSSR && setInSSRSetupState(false);
	return setupResult;
}
function setupStatefulComponent(instance, isSSR) {
	const Component = instance.type;
	instance.accessCache = /* @__PURE__ */ Object.create(null);
	instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers);
	const { setup } = Component;
	if (setup) {
		pauseTracking();
		const setupContext = instance.setupContext = setup.length > 1 ? createSetupContext(instance) : null;
		const reset = setCurrentInstance(instance);
		const setupResult = callWithErrorHandling(setup, instance, 0, [instance.props, setupContext]);
		const isAsyncSetup = isPromise(setupResult);
		resetTracking();
		reset();
		if ((isAsyncSetup || instance.sp) && !isAsyncWrapper(instance)) markAsyncBoundary(instance);
		if (isAsyncSetup) {
			setupResult.then(unsetCurrentInstance, unsetCurrentInstance);
			if (isSSR) return setupResult.then((resolvedResult) => {
				setInSSRSetupState(true);
				try {
					handleSetupResult(instance, resolvedResult, isSSR);
				} finally {
					setInSSRSetupState(false);
				}
			}).catch((e) => {
				handleError(e, instance, 0);
			});
			else instance.asyncDep = setupResult;
		} else handleSetupResult(instance, setupResult, isSSR);
	} else finishComponentSetup(instance, isSSR);
}
function handleSetupResult(instance, setupResult, isSSR) {
	if (isFunction(setupResult)) {
		if (instance.type.__ssrInlineRender) instance.ssrRender = setupResult;
		else instance.render = setupResult;
	} else if (isObject(setupResult)) instance.setupState = proxyRefs(setupResult);
	finishComponentSetup(instance, isSSR);
}
function finishComponentSetup(instance, isSSR, skipOptions) {
	const Component = instance.type;
	if (!instance.render) instance.render = Component.render || NOOP;
	{
		const reset = setCurrentInstance(instance);
		pauseTracking();
		try {
			applyOptions(instance);
		} finally {
			resetTracking();
			reset();
		}
	}
}
var attrsProxyHandlers = { get(target, key) {
	track(target, "get", "");
	return target[key];
} };
function createSetupContext(instance) {
	const expose = (exposed) => {
		instance.exposed = exposed || {};
	};
	return {
		attrs: new Proxy(instance.attrs, attrsProxyHandlers),
		slots: instance.slots,
		emit: instance.emit,
		expose
	};
}
function getComponentPublicInstance(instance) {
	if (instance.exposed) return instance.exposeProxy || (instance.exposeProxy = new Proxy(proxyRefs(markRaw(instance.exposed)), {
		get(target, key) {
			if (key in target) return target[key];
			else if (key in publicPropertiesMap) return publicPropertiesMap[key](instance);
		},
		has(target, key) {
			return key in target || key in publicPropertiesMap;
		}
	}));
	else return instance.proxy;
}
function getComponentName(Component, includeInferred = true) {
	return isFunction(Component) ? Component.displayName || Component.name : Component.name || includeInferred && Component.__name;
}
function isClassComponent(value) {
	return isFunction(value) && "__vccOpts" in value;
}
var computed = (getterOrOptions, debugOptions) => {
	return /* @__PURE__ */ computed$1(getterOrOptions, debugOptions, isInSSRComponentSetup);
};
function h(type, propsOrChildren, children) {
	try {
		setBlockTracking(-1);
		const l = arguments.length;
		if (l === 2) {
			if (isObject(propsOrChildren) && !isArray$1(propsOrChildren)) {
				if (isVNode(propsOrChildren)) return createVNode(type, null, [propsOrChildren]);
				return createVNode(type, propsOrChildren);
			} else return createVNode(type, null, propsOrChildren);
		} else {
			if (l > 3) children = Array.prototype.slice.call(arguments, 2);
			else if (l === 3 && isVNode(children)) children = [children];
			return createVNode(type, propsOrChildren, children);
		}
	} finally {
		setBlockTracking(1);
	}
}
var version = "3.5.44";
// node_modules/@vue/runtime-dom/dist/runtime-dom.esm-bundler.js
/**
* @vue/runtime-dom v3.5.44
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
var policy = void 0;
var tt = typeof window !== "undefined" && window.trustedTypes;
if (tt) try {
	policy = /* @__PURE__ */ tt.createPolicy("vue", { createHTML: (val) => val });
} catch (e) {}
var unsafeToTrustedHTML = policy ? (val) => policy.createHTML(val) : (val) => val;
var svgNS = "http://www.w3.org/2000/svg";
var mathmlNS = "http://www.w3.org/1998/Math/MathML";
var doc = typeof document !== "undefined" ? document : null;
var templateContainer = doc && /* @__PURE__ */ doc.createElement("template");
var nodeOps = {
	insert: (child, parent, anchor) => {
		parent.insertBefore(child, anchor || null);
	},
	remove: (child) => {
		const parent = child.parentNode;
		if (parent) parent.removeChild(child);
	},
	createElement: (tag, namespace, is, props) => {
		const el = namespace === "svg" ? doc.createElementNS(svgNS, tag) : namespace === "mathml" ? doc.createElementNS(mathmlNS, tag) : is ? doc.createElement(tag, { is }) : doc.createElement(tag);
		if (tag === "select" && props && props.multiple != null) el.setAttribute("multiple", props.multiple);
		return el;
	},
	createText: (text) => doc.createTextNode(text),
	createComment: (text) => doc.createComment(text),
	setText: (node, text) => {
		node.nodeValue = text;
	},
	setElementText: (el, text) => {
		el.textContent = text;
	},
	parentNode: (node) => node.parentNode,
	nextSibling: (node) => node.nextSibling,
	querySelector: (selector) => doc.querySelector(selector),
	setScopeId(el, id) {
		el.setAttribute(id, "");
	},
	insertStaticContent(content, parent, anchor, namespace, start, end) {
		const before = anchor ? anchor.previousSibling : parent.lastChild;
		if (start && (start === end || start.nextSibling)) while (true) {
			parent.insertBefore(start.cloneNode(true), anchor);
			if (start === end || !(start = start.nextSibling)) break;
		}
		else {
			templateContainer.innerHTML = unsafeToTrustedHTML(namespace === "svg" ? `<svg>${content}</svg>` : namespace === "mathml" ? `<math>${content}</math>` : content);
			const template = templateContainer.content;
			if (namespace === "svg" || namespace === "mathml") {
				const wrapper = template.firstChild;
				while (wrapper.firstChild) template.appendChild(wrapper.firstChild);
				template.removeChild(wrapper);
			}
			parent.insertBefore(template, anchor);
		}
		return [before ? before.nextSibling : parent.firstChild, anchor ? anchor.previousSibling : parent.lastChild];
	}
};
var vtcKey = /* @__PURE__ */ Symbol("_vtc");
function patchClass(el, value, isSVG) {
	const transitionClasses = el[vtcKey];
	if (transitionClasses) value = (value ? [value, ...transitionClasses] : [...transitionClasses]).join(" ");
	if (value == null) el.removeAttribute("class");
	else if (isSVG) el.setAttribute("class", value);
	else el.className = value;
}
var vShowOriginalDisplay = /* @__PURE__ */ Symbol("_vod");
var vShowHidden = /* @__PURE__ */ Symbol("_vsh");
var CSS_VAR_TEXT = /* @__PURE__ */ Symbol("");
var displayRE = /(?:^|;)\s*display\s*:/;
function patchStyle(el, prev, next) {
	const style = el.style;
	const isCssString = isString(next);
	let hasControlledDisplay = false;
	if (next && !isCssString) {
		if (prev) {
			if (!isString(prev)) {
				for (const key in prev) if (next[key] == null) setStyle(style, key, "");
			} else for (const prevStyle of prev.split(";")) {
				const key = prevStyle.slice(0, prevStyle.indexOf(":")).trim();
				if (next[key] == null) setStyle(style, key, "");
			}
		}
		for (const key in next) {
			if (key === "display") hasControlledDisplay = true;
			const value = next[key];
			if (value != null) {
				if (!shouldPreserveTextareaResizeStyle(el, key, !isString(prev) && prev ? prev[key] : void 0, value)) setStyle(style, key, value);
			} else setStyle(style, key, "");
		}
	} else if (isCssString) {
		if (prev !== next) {
			const cssVarText = style[CSS_VAR_TEXT];
			if (cssVarText) next += ";" + cssVarText;
			style.cssText = next;
			hasControlledDisplay = displayRE.test(next);
		}
	} else if (prev) el.removeAttribute("style");
	if (vShowOriginalDisplay in el) {
		if (!isCssString || prev !== next) el[vShowOriginalDisplay] = hasControlledDisplay ? style.display : "";
		if (el[vShowHidden]) style.display = "none";
	}
}
var importantRE = /\s*!important$/;
function setStyle(style, name, val) {
	if (isArray$1(val)) val.forEach((v) => setStyle(style, name, v));
	else {
		if (val == null) val = "";
		if (name.startsWith("--")) {
			if (importantRE.test(val)) style.setProperty(name, val.replace(importantRE, ""), "important");
			else style.setProperty(name, val);
		} else {
			const prefixed = autoPrefix(style, name);
			if (importantRE.test(val)) style.setProperty(hyphenate(prefixed), val.replace(importantRE, ""), "important");
			else style[prefixed] = val;
		}
	}
}
var prefixes = [
	"Webkit",
	"Moz",
	"ms"
];
var prefixCache = {};
function autoPrefix(style, rawName) {
	const cached = prefixCache[rawName];
	if (cached) return cached;
	let name = camelize(rawName);
	if (name !== "filter" && name in style) return prefixCache[rawName] = name;
	name = capitalize(name);
	for (let i = 0; i < prefixes.length; i++) {
		const prefixed = prefixes[i] + name;
		if (prefixed in style) return prefixCache[rawName] = prefixed;
	}
	return rawName;
}
function shouldPreserveTextareaResizeStyle(el, key, prev, next) {
	return el.tagName === "TEXTAREA" && (key === "width" || key === "height") && isString(next) && prev === next;
}
var xlinkNS = "http://www.w3.org/1999/xlink";
function patchAttr(el, key, value, isSVG, instance, isBoolean = isSpecialBooleanAttr(key)) {
	if (isSVG && key.startsWith("xlink:")) {
		if (value == null) el.removeAttributeNS(xlinkNS, key.slice(6, key.length));
		else el.setAttributeNS(xlinkNS, key, value);
	} else if (value == null || isBoolean && !includeBooleanAttr(value)) el.removeAttribute(key);
	else el.setAttribute(key, isBoolean ? "" : isSymbol(value) ? String(value) : value);
}
function patchDOMProp(el, key, value, parentComponent, attrName) {
	if (key === "innerHTML" || key === "textContent") {
		if (value != null) el[key] = key === "innerHTML" ? unsafeToTrustedHTML(value) : value;
		return;
	}
	const tag = el.tagName;
	if (key === "value" && tag !== "PROGRESS" && !tag.includes("-")) {
		const oldValue = tag === "OPTION" ? el.getAttribute("value") || "" : el.value;
		const newValue = value == null ? el.type === "checkbox" ? "on" : "" : String(value);
		if (oldValue !== newValue || !("_value" in el)) el.value = newValue;
		if (value == null) el.removeAttribute(key);
		el._value = value;
		return;
	}
	let needRemove = false;
	if (value === "" || value == null) {
		const type = typeof el[key];
		if (type === "boolean") value = includeBooleanAttr(value);
		else if (value == null && type === "string") {
			value = "";
			needRemove = true;
		} else if (type === "number") {
			value = 0;
			needRemove = true;
		}
	}
	try {
		el[key] = value;
	} catch (e) {}
	needRemove && el.removeAttribute(attrName || key);
}
function addEventListener(el, event, handler, options) {
	el.addEventListener(event, handler, options);
}
function removeEventListener(el, event, handler, options) {
	el.removeEventListener(event, handler, options);
}
var veiKey = /* @__PURE__ */ Symbol("_vei");
function patchEvent(el, rawName, prevValue, nextValue, instance = null) {
	const invokers = el[veiKey] || (el[veiKey] = {});
	const existingInvoker = invokers[rawName];
	if (nextValue && existingInvoker) existingInvoker.value = nextValue;
	else {
		const [name, options] = parseName(rawName);
		if (nextValue) addEventListener(el, name, invokers[rawName] = createInvoker(nextValue, instance), options);
		else if (existingInvoker) {
			removeEventListener(el, name, existingInvoker, options);
			invokers[rawName] = void 0;
		}
	}
}
var optionsModifierRE = /(Once|Passive|Capture)$/;
var optionsModifierEventRE = /^on:?(?:Once|Passive|Capture)$/;
function parseName(name) {
	let options;
	let m;
	while ((m = name.match(optionsModifierRE)) && !optionsModifierEventRE.test(name)) {
		if (!options) options = {};
		name = name.slice(0, name.length - m[1].length);
		options[m[1].toLowerCase()] = true;
	}
	return [name[2] === ":" ? name.slice(3) : hyphenate(name.slice(2)), options];
}
var cachedNow = 0;
var p = /* @__PURE__ */ Promise.resolve();
var getNow = () => cachedNow || (p.then(() => cachedNow = 0), cachedNow = Date.now());
function createInvoker(initialValue, instance) {
	const invoker = (e) => {
		if (!e._vts) e._vts = Date.now();
		else if (e._vts <= invoker.attached) return;
		const value = invoker.value;
		if (isArray$1(value)) {
			const originalStop = e.stopImmediatePropagation;
			e.stopImmediatePropagation = () => {
				originalStop.call(e);
				e._stopped = true;
			};
			const handlers = value.slice();
			const args = [e];
			for (let i = 0; i < handlers.length; i++) {
				if (e._stopped) break;
				const handler = handlers[i];
				if (handler) callWithAsyncErrorHandling(handler, instance, 5, args);
			}
		} else callWithAsyncErrorHandling(value, instance, 5, [e]);
	};
	invoker.value = initialValue;
	invoker.attached = getNow();
	return invoker;
}
var isNativeOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && key.charCodeAt(2) > 96 && key.charCodeAt(2) < 123;
var patchProp = (el, key, prevValue, nextValue, namespace, parentComponent) => {
	const isSVG = namespace === "svg";
	if (key === "class") patchClass(el, nextValue, isSVG);
	else if (key === "style") patchStyle(el, prevValue, nextValue);
	else if (isOn(key)) {
		if (!isModelListener(key)) patchEvent(el, key, prevValue, nextValue, parentComponent);
	} else if (key[0] === "." ? (key = key.slice(1), true) : key[0] === "^" ? (key = key.slice(1), false) : shouldSetAsProp(el, key, nextValue, isSVG)) {
		patchDOMProp(el, key, nextValue);
		if (!el.tagName.includes("-") && (key === "value" || key === "checked" || key === "selected")) patchAttr(el, key, nextValue, isSVG, parentComponent, key !== "value");
	} else if (el._isVueCE && (shouldSetAsPropForVueCE(el, key) || el._def.__asyncLoader && (/[A-Z]/.test(key) || !isString(nextValue)))) patchDOMProp(el, camelize(key), nextValue, parentComponent, key);
	else {
		if (key === "true-value") el._trueValue = nextValue;
		else if (key === "false-value") el._falseValue = nextValue;
		patchAttr(el, key, nextValue, isSVG);
	}
};
function shouldSetAsProp(el, key, value, isSVG) {
	if (isSVG) {
		if (key === "innerHTML" || key === "textContent") return true;
		if (key in el && isNativeOn(key) && isFunction(value)) return true;
		return false;
	}
	if (key === "spellcheck" || key === "draggable" || key === "translate" || key === "autocorrect") return false;
	if (key === "sandbox" && el.tagName === "IFRAME") return false;
	if (key === "form") return false;
	if (key === "list" && el.tagName === "INPUT") return false;
	if (key === "type" && el.tagName === "TEXTAREA") return false;
	if (key === "width" || key === "height") {
		const tag = el.tagName;
		if (tag === "IMG" || tag === "VIDEO" || tag === "CANVAS" || tag === "SOURCE") return false;
	}
	if (isNativeOn(key) && isString(value)) return false;
	return key in el;
}
function shouldSetAsPropForVueCE(el, key) {
	const props = el._def.props;
	if (!props) return false;
	const camelKey = camelize(key);
	return Array.isArray(props) ? props.some((prop) => camelize(prop) === camelKey) : Object.keys(props).some((prop) => camelize(prop) === camelKey);
}
var getModelAssigner = (vnode) => {
	const fn = vnode.props["onUpdate:modelValue"] || false;
	return isArray$1(fn) ? (value) => invokeArrayFns(fn, value) : fn;
};
function onCompositionStart(e) {
	e.target.composing = true;
}
function onCompositionEnd(e) {
	const target = e.target;
	if (target.composing) {
		target.composing = false;
		target.dispatchEvent(new Event("input"));
	}
}
var assignKey = /* @__PURE__ */ Symbol("_assign");
var initialValueKey = /* @__PURE__ */ Symbol("_initialValue");
function castValue(value, trim, number) {
	if (trim) value = value.trim();
	if (number) value = looseToNumber(value);
	return value;
}
var vModelText = {
	created(el, { modifiers: { lazy, trim, number } }, vnode) {
		if (el.parentNode) {
			if (el.type === "text") el[initialValueKey] = el.defaultValue.replace(/[\r\n]/g, "");
			else if (el.type === "textarea") el[initialValueKey] = el.defaultValue.replace(/\r\n?/g, "\n");
		}
		el[assignKey] = getModelAssigner(vnode);
		const castToNumber = number || vnode.props && vnode.props.type === "number";
		addEventListener(el, lazy ? "change" : "input", (e) => {
			if (e.target.composing) return;
			el[assignKey](castValue(el.value, trim, castToNumber));
		});
		if (trim || castToNumber) addEventListener(el, "change", () => {
			el.value = castValue(el.value, trim, castToNumber);
		});
		if (!lazy) {
			addEventListener(el, "compositionstart", onCompositionStart);
			addEventListener(el, "compositionend", onCompositionEnd);
			addEventListener(el, "change", onCompositionEnd);
		}
	},
	mounted(el, { value, modifiers: { trim, number } }) {
		const newValue = value == null ? "" : value;
		const initialValue = el[initialValueKey];
		delete el[initialValueKey];
		if (initialValue !== void 0 && (el.type === "text" || el.type === "textarea") && el.value !== initialValue) el[assignKey](castValue(el.value, trim, number));
		else el.value = newValue;
	},
	beforeUpdate(el, { value, oldValue, modifiers: { lazy, trim, number } }, vnode) {
		el[assignKey] = getModelAssigner(vnode);
		if (el.composing) return;
		const elValue = (number || el.type === "number") && !/^0\d/.test(el.value) ? looseToNumber(el.value) : el.value;
		const newValue = value == null ? "" : value;
		if (elValue === newValue) return;
		const rootNode = el.getRootNode();
		if ((rootNode instanceof Document || rootNode instanceof ShadowRoot) && rootNode.activeElement === el && el.type !== "range") {
			if (lazy && value === oldValue) return;
			if (trim && el.value.trim() === newValue) return;
		}
		el.value = newValue;
	}
};
var vModelCheckbox = {
	deep: true,
	created(el, _, vnode) {
		el[assignKey] = getModelAssigner(vnode);
		addEventListener(el, "change", () => {
			const modelValue = el._modelValue;
			const elementValue = getValue(el);
			const checked = el.checked;
			const assign = el[assignKey];
			if (isArray$1(modelValue)) {
				const index = looseIndexOf(modelValue, elementValue);
				const found = index !== -1;
				if (checked && !found) assign(modelValue.concat(elementValue));
				else if (!checked && found) {
					const filtered = [...modelValue];
					filtered.splice(index, 1);
					assign(filtered);
				}
			} else if (isSet(modelValue)) {
				const cloned = new Set(modelValue);
				if (checked) cloned.add(elementValue);
				else cloned.delete(elementValue);
				assign(cloned);
			} else assign(getCheckboxValue(el, checked));
		});
	},
	mounted: setChecked,
	beforeUpdate(el, binding, vnode) {
		el[assignKey] = getModelAssigner(vnode);
		setChecked(el, binding, vnode);
	}
};
function setChecked(el, { value, oldValue }, vnode) {
	el._modelValue = value;
	let checked;
	if (isArray$1(value)) checked = looseIndexOf(value, vnode.props.value) > -1;
	else if (isSet(value)) checked = value.has(vnode.props.value);
	else {
		if (value === oldValue) return;
		checked = looseEqual(value, getCheckboxValue(el, true));
	}
	if (el.checked !== checked) el.checked = checked;
}
var vModelSelect = {
	deep: true,
	created(el, { value, modifiers: { number } }, vnode) {
		el._modelValue = value;
		addEventListener(el, "change", () => {
			const selectedVal = Array.prototype.filter.call(el.options, (o) => o.selected).map((o) => number ? looseToNumber(getValue(o)) : getValue(o));
			const multiple = el.multiple;
			const assignedValue = multiple ? isSet(el._modelValue) ? new Set(selectedVal) : selectedVal : selectedVal[0];
			const pending = el._pendingValue = [multiple, multiple ? isArray$1(assignedValue) ? selectedVal.slice() : selectedVal : assignedValue];
			try {
				el[assignKey](assignedValue);
			} finally {
				nextTick(() => {
					if (el._pendingValue === pending) el._pendingValue = void 0;
				});
			}
		});
		el[assignKey] = getModelAssigner(vnode);
	},
	mounted(el, { value }) {
		setSelected(el, value);
	},
	beforeUpdate(el, { value }, vnode) {
		el._modelValue = value;
		el[assignKey] = getModelAssigner(vnode);
	},
	updated(el, { value }) {
		const pending = el._pendingValue;
		el._pendingValue = void 0;
		if (!pending || pending[0] !== el.multiple || !isSameSelectValue(value, pending[1], pending[0])) setSelected(el, value);
	}
};
function isSameSelectValue(value, assignedValue, multiple) {
	if (!multiple) return looseEqual(value, assignedValue);
	if (isArray$1(value)) return looseEqual(value, assignedValue);
	if (isSet(value)) {
		if (value.size !== assignedValue.length) return false;
		for (const item of assignedValue) if (!value.has(item)) return false;
		return true;
	}
	return false;
}
function setSelected(el, value) {
	const isMultiple = el.multiple;
	const isArrayValue = isArray$1(value);
	if (isMultiple && !isArrayValue && !isSet(value)) return;
	for (let i = 0, l = el.options.length; i < l; i++) {
		const option = el.options[i];
		const optionValue = getValue(option);
		if (isMultiple) {
			if (isArrayValue) {
				const optionType = typeof optionValue;
				if (optionType === "string" || optionType === "number") option.selected = value.some((v) => String(v) === String(optionValue));
				else option.selected = looseIndexOf(value, optionValue) > -1;
			} else option.selected = value.has(optionValue);
		} else if (looseEqual(getValue(option), value)) {
			if (el.selectedIndex !== i) el.selectedIndex = i;
			return;
		}
	}
	if (!isMultiple && el.selectedIndex !== -1) el.selectedIndex = -1;
}
function getValue(el) {
	return "_value" in el ? el._value : el.value;
}
function getCheckboxValue(el, checked) {
	const key = checked ? "_trueValue" : "_falseValue";
	return key in el ? el[key] : checked;
}
var systemModifiers = [
	"ctrl",
	"shift",
	"alt",
	"meta"
];
var modifierGuards = {
	stop: (e) => e.stopPropagation(),
	prevent: (e) => e.preventDefault(),
	self: (e) => e.target !== e.currentTarget,
	ctrl: (e) => !e.ctrlKey,
	shift: (e) => !e.shiftKey,
	alt: (e) => !e.altKey,
	meta: (e) => !e.metaKey,
	left: (e) => "button" in e && e.button !== 0,
	middle: (e) => "button" in e && e.button !== 1,
	right: (e) => "button" in e && e.button !== 2,
	exact: (e, modifiers) => systemModifiers.some((m) => e[`${m}Key`] && !modifiers.includes(m))
};
var withModifiers = (fn, modifiers) => {
	if (!fn) return fn;
	const cache = fn._withMods || (fn._withMods = {});
	const cacheKey = modifiers.join(".");
	return cache[cacheKey] || (cache[cacheKey] = ((event, ...args) => {
		for (let i = 0; i < modifiers.length; i++) {
			const guard = modifierGuards[modifiers[i]];
			if (guard && guard(event, modifiers)) return;
		}
		return fn(event, ...args);
	}));
};
var rendererOptions = /* @__PURE__ */ extend({ patchProp }, nodeOps);
var renderer;
function ensureRenderer() {
	return renderer || (renderer = createRenderer(rendererOptions));
}
var createApp = ((...args) => {
	const app = ensureRenderer().createApp(...args);
	const { mount } = app;
	app.mount = (containerOrSelector) => {
		const container = normalizeContainer(containerOrSelector);
		if (!container) return;
		const component = app._component;
		if (!isFunction(component) && !component.render && !component.template) component.template = container.innerHTML;
		if (container.nodeType === 1) container.textContent = "";
		const proxy = mount(container, false, resolveRootNamespace(container));
		if (container instanceof Element) {
			container.removeAttribute("v-cloak");
			container.setAttribute("data-v-app", "");
		}
		return proxy;
	};
	return app;
});
function resolveRootNamespace(container) {
	if (container instanceof SVGElement) return "svg";
	if (typeof MathMLElement === "function" && container instanceof MathMLElement) return "mathml";
}
function normalizeContainer(container) {
	if (isString(container)) return document.querySelector(container);
	return container;
}
// node_modules/pinia/dist/pinia.js
/*!
* pinia v4.1.0
* (c) 2026 Eduardo San Martin Morote
* @license MIT
*/
var IS_CLIENT = typeof window !== "undefined";
/**
* setActivePinia must be called to handle SSR at the top of functions like
* `fetch`, `setup`, `serverPrefetch` and others
*/
var activePinia;
/**
* Sets or unsets the active pinia. Used in SSR and internally when calling
* actions and getters
*
* @param pinia - Pinia instance
*/
var setActivePinia = (pinia) => activePinia = pinia;
/**
* Symbol used to provide/inject the pinia instance in the app. Used internally
* and exposed for testing purposes and edge cases like storybook. Could break
* in a minor, **USE AT YOUR OWN RISK**.
*
* For context, see:
* - https://github.com/vuejs/pinia/issues/870
* - https://github.com/vuejs/pinia/pull/2973
*
* @internal
*/
var piniaSymbol = Symbol();
function isPlainObject(o) {
	return o && typeof o === "object" && Object.prototype.toString.call(o) === "[object Object]" && typeof o.toJSON !== "function";
}
var _global = /*#__PURE__*/ (() => typeof window === "object" && window.window === window ? window : typeof self === "object" && self.self === self ? self : typeof global === "object" && global.global === global ? global : typeof globalThis === "object" ? globalThis : { HTMLElement: null })();
function bom(blob, { autoBom = false } = {}) {
	if (autoBom && /^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(blob.type)) return new Blob([String.fromCharCode(65279), blob], { type: blob.type });
	return blob;
}
function download(url, name, opts) {
	const xhr = new XMLHttpRequest();
	xhr.open("GET", url);
	xhr.responseType = "blob";
	xhr.onload = function() {
		saveAs(xhr.response, name, opts);
	};
	xhr.onerror = function() {
		console.error("could not download file");
	};
	xhr.send();
}
function corsEnabled(url) {
	const xhr = new XMLHttpRequest();
	xhr.open("HEAD", url, false);
	try {
		xhr.send();
	} catch (e) {}
	return xhr.status >= 200 && xhr.status <= 299;
}
function click(node) {
	try {
		node.dispatchEvent(new MouseEvent("click"));
	} catch (e) {
		const evt = new MouseEvent("click", {
			bubbles: true,
			cancelable: true,
			view: window,
			detail: 0,
			screenX: 80,
			screenY: 20,
			clientX: 80,
			clientY: 20,
			ctrlKey: false,
			altKey: false,
			shiftKey: false,
			metaKey: false,
			button: 0,
			relatedTarget: null
		});
		node.dispatchEvent(evt);
	}
}
var _navigator = typeof navigator === "object" ? navigator : { userAgent: "" };
var isMacOSWebView = /*#__PURE__*/ (() => /Macintosh/.test(_navigator.userAgent) && /AppleWebKit/.test(_navigator.userAgent) && !/Safari/.test(_navigator.userAgent))();
var saveAs = !IS_CLIENT ? () => {} : typeof HTMLAnchorElement !== "undefined" && "download" in HTMLAnchorElement.prototype && !isMacOSWebView ? downloadSaveAs : "msSaveOrOpenBlob" in _navigator ? msSaveAs : fileSaverSaveAs;
function downloadSaveAs(blob, name = "download", opts) {
	const a = document.createElement("a");
	a.download = name;
	a.rel = "noopener";
	if (typeof blob === "string") {
		a.href = blob;
		if (a.origin !== location.origin) {
			if (corsEnabled(a.href)) download(blob, name, opts);
			else {
				a.target = "_blank";
				click(a);
			}
		} else click(a);
	} else {
		a.href = URL.createObjectURL(blob);
		setTimeout(function() {
			URL.revokeObjectURL(a.href);
		}, 4e4);
		setTimeout(function() {
			click(a);
		}, 0);
	}
}
function msSaveAs(blob, name = "download", opts) {
	if (typeof blob === "string") {
		if (corsEnabled(blob)) download(blob, name, opts);
		else {
			const a = document.createElement("a");
			a.href = blob;
			a.target = "_blank";
			setTimeout(function() {
				click(a);
			});
		}
	} else navigator.msSaveOrOpenBlob(bom(blob, opts), name);
}
function fileSaverSaveAs(blob, name, opts, popup) {
	popup = popup || open("", "_blank");
	if (popup) popup.document.title = popup.document.body.innerText = "downloading...";
	if (typeof blob === "string") return download(blob, name, opts);
	const force = blob.type === "application/octet-stream";
	const isSafari = /constructor/i.test(String(_global.HTMLElement)) || "safari" in _global;
	const isChromeIOS = /CriOS\/[\d]+/.test(navigator.userAgent);
	if ((isChromeIOS || force && isSafari || isMacOSWebView) && typeof FileReader !== "undefined") {
		const reader = new FileReader();
		reader.onloadend = function() {
			let url = reader.result;
			if (typeof url !== "string") {
				popup = null;
				throw new Error("Wrong reader.result type");
			}
			url = isChromeIOS ? url : url.replace(/^data:[^;]*;/, "data:attachment/file;");
			if (popup) popup.location.href = url;
			else location.assign(url);
			popup = null;
		};
		reader.readAsDataURL(blob);
	} else {
		const url = URL.createObjectURL(blob);
		if (popup) popup.location.assign(url);
		else location.href = url;
		popup = null;
		setTimeout(function() {
			URL.revokeObjectURL(url);
		}, 4e4);
	}
}
var { assign: assign$1 } = Object;
/**
* Creates a Pinia instance to be used by the application
*/
function createPinia() {
	const scope = effectScope(true);
	const state = scope.run(() => /* @__PURE__ */ ref({}));
	let _p = [];
	let toBeInstalled = [];
	const pinia = markRaw({
		install(app) {
			setActivePinia(pinia);
			pinia._a = app;
			app.provide(piniaSymbol, pinia);
			app.config.globalProperties.$pinia = pinia;
			toBeInstalled.forEach((plugin) => _p.push(plugin));
			toBeInstalled = [];
		},
		use(plugin) {
			if (!this._a) toBeInstalled.push(plugin);
			else _p.push(plugin);
			return this;
		},
		_p,
		_a: null,
		_e: scope,
		_s: /* @__PURE__ */ new Map(),
		state
	});
	return pinia;
}
var noop$1 = () => {};
function addSubscription(subscriptions, callback, detached, onCleanup = noop$1) {
	subscriptions.add(callback);
	const removeSubscription = () => {
		subscriptions.delete(callback) && onCleanup();
	};
	if (!detached && getCurrentScope()) onScopeDispose(removeSubscription);
	return removeSubscription;
}
function triggerSubscriptions(subscriptions, ...args) {
	subscriptions.forEach((callback) => {
		callback(...args);
	});
}
var fallbackRunWithContext = (fn) => fn();
/**
* Marks a function as an action for `$onAction`
* @internal
*/
var ACTION_MARKER = Symbol();
/**
* Action name symbol. Allows to add a name to an action after defining it
* @internal
*/
var ACTION_NAME = Symbol();
function mergeReactiveObjects(target, patchToApply) {
	if (target instanceof Map && patchToApply instanceof Map) patchToApply.forEach((value, key) => target.set(key, value));
	else if (target instanceof Set && patchToApply instanceof Set) patchToApply.forEach(target.add, target);
	for (const key in patchToApply) {
		if (!Object.hasOwn(patchToApply, key)) continue;
		const subPatch = patchToApply[key];
		const targetValue = target[key];
		if (isPlainObject(targetValue) && isPlainObject(subPatch) && Object.hasOwn(target, key) && !/* @__PURE__ */ isRef(subPatch) && !/* @__PURE__ */ isReactive(subPatch)) {
			target[key] = mergeReactiveObjects(targetValue, subPatch);
			const targetRef = (/* @__PURE__ */ toRaw(target))[key];
			if (/* @__PURE__ */ isRef(targetRef) && /* @__PURE__ */ isShallow(targetRef)) triggerRef(targetRef);
		} else target[key] = subPatch;
	}
	return target;
}
var skipHydrateSymbol = Symbol();
/**
* Returns whether a value should be hydrated
*
* @param obj - target variable
* @returns true if `obj` should be hydrated
*/
function shouldHydrate(obj) {
	return !obj || typeof obj !== "object" || !Object.hasOwn(obj, skipHydrateSymbol);
}
var { assign: assign$2 } = Object;
function isComputed(o) {
	return !!(/* @__PURE__ */ isRef(o) && o.effect);
}
function createOptionsStore(id, options, pinia, hot) {
	const { state, actions, getters } = options;
	const initialState = pinia.state.value[id];
	let store;
	function setup() {
		if (!initialState && true)
 /* istanbul ignore if */
		pinia.state.value[id] = state ? state() : {};
		return assign$2(/* @__PURE__ */ toRefs(pinia.state.value[id]), actions, Object.keys(getters || {}).reduce((computedGetters, name) => {
			computedGetters[name] = markRaw(computed(() => {
				setActivePinia(pinia);
				const store = pinia._s.get(id);
				return getters[name].call(store, store);
			}));
			return computedGetters;
		}, {}));
	}
	store = createSetupStore(id, setup, options, pinia, hot, true);
	return store;
}
function createSetupStore($id, setup, options = {}, pinia, hot, isOptionsStore) {
	let scope;
	const optionsForPlugin = assign$2({ actions: {} }, options);
	const $subscribeOptions = { deep: true };
	let isListening;
	let isSyncListening;
	let subscriptions = /* @__PURE__ */ new Set();
	let actionSubscriptions = /* @__PURE__ */ new Set();
	let debuggerEvents;
	const initialState = pinia.state.value[$id];
	if (!isOptionsStore && !initialState && true)
 /* istanbul ignore if */
	pinia.state.value[$id] = {};
	let activeListener;
	function $patch(partialStateOrMutator) {
		let subscriptionMutation;
		isListening = isSyncListening = false;
		if (typeof partialStateOrMutator === "function") {
			partialStateOrMutator(pinia.state.value[$id]);
			subscriptionMutation = {
				type: "patch function",
				storeId: $id,
				events: debuggerEvents
			};
		} else {
			mergeReactiveObjects(pinia.state.value[$id], partialStateOrMutator);
			subscriptionMutation = {
				type: "patch object",
				payload: partialStateOrMutator,
				storeId: $id,
				events: debuggerEvents
			};
		}
		const myListenerId = activeListener = Symbol();
		nextTick().then(() => {
			if (activeListener === myListenerId) isListening = true;
		});
		isSyncListening = true;
		triggerSubscriptions(subscriptions, subscriptionMutation, pinia.state.value[$id]);
	}
	const $reset = isOptionsStore ? function $reset() {
		const { state } = options;
		const newState = state ? state() : {};
		this.$patch(($state) => {
			assign$2($state, newState);
		});
	} : noop$1;
	function $dispose() {
		scope.stop();
		subscriptions.clear();
		actionSubscriptions.clear();
		pinia._s.delete($id);
	}
	/**
	* Helper that wraps function so it can be tracked with $onAction
	* @param fn - action to wrap
	* @param name - name of the action
	*/
	const action = (fn, name = "") => {
		if (ACTION_MARKER in fn) {
			fn[ACTION_NAME] = name;
			return fn;
		}
		const wrappedAction = function() {
			setActivePinia(pinia);
			const args = Array.from(arguments);
			const afterCallbackSet = /* @__PURE__ */ new Set();
			const onErrorCallbackSet = /* @__PURE__ */ new Set();
			function after(callback) {
				afterCallbackSet.add(callback);
			}
			function onError(callback) {
				onErrorCallbackSet.add(callback);
			}
			triggerSubscriptions(actionSubscriptions, {
				args,
				name: wrappedAction[ACTION_NAME],
				store,
				after,
				onError
			});
			let ret;
			try {
				ret = fn.apply(this && this.$id === $id ? this : store, args);
			} catch (error) {
				triggerSubscriptions(onErrorCallbackSet, error);
				throw error;
			}
			if (ret instanceof Promise) return ret.then((value) => {
				triggerSubscriptions(afterCallbackSet, value);
				return value;
			}).catch((error) => {
				triggerSubscriptions(onErrorCallbackSet, error);
				return Promise.reject(error);
			});
			triggerSubscriptions(afterCallbackSet, ret);
			return ret;
		};
		wrappedAction[ACTION_MARKER] = true;
		wrappedAction[ACTION_NAME] = name;
		return wrappedAction;
	};
	const store = /* @__PURE__ */ reactive({
		_p: pinia,
		$id,
		$onAction: addSubscription.bind(null, actionSubscriptions),
		$patch,
		$reset,
		$subscribe(callback, options = {}) {
			if (subscriptions.has(callback)) return noop$1;
			const removeSubscription = addSubscription(subscriptions, callback, options.detached, () => stopWatcher());
			const stopWatcher = scope.run(() => watch(() => pinia.state.value[$id], (state) => {
				if (options.flush === "sync" ? isSyncListening : isListening) callback({
					storeId: $id,
					type: "direct",
					events: debuggerEvents
				}, state);
			}, assign$2({}, $subscribeOptions, options)));
			return removeSubscription;
		},
		$dispose
	});
	pinia._s.set($id, store);
	const setupStore = (pinia._a && pinia._a.runWithContext || fallbackRunWithContext)(() => pinia._e.run(() => (scope = effectScope()).run(() => setup({ action }))));
	for (const key in setupStore) {
		const prop = setupStore[key];
		if (/* @__PURE__ */ isRef(prop) && !isComputed(prop) || /* @__PURE__ */ isReactive(prop)) {
			if (!isOptionsStore) {
				if (initialState && shouldHydrate(prop)) {
					if (/* @__PURE__ */ isRef(prop)) prop.value = initialState[key];
					else {
						if (prop instanceof Set || prop instanceof Map) prop.clear();
						mergeReactiveObjects(prop, initialState[key]);
					}
				}
				pinia.state.value[$id][key] = prop;
			}
		} else if (typeof prop === "function") {
			setupStore[key] = action(prop, key);
			optionsForPlugin.actions[key] = prop;
		}
	}
	/* istanbul ignore if */
	assign$2(store, setupStore);
	assign$2(/* @__PURE__ */ toRaw(store), setupStore);
	Object.defineProperty(store, "$state", {
		get: () => pinia.state.value[$id],
		set: (state) => {
			$patch(($state) => {
				assign$2($state, state);
			});
		}
	});
	pinia._p.forEach((extender) => {
		const extensions = scope.run(() => extender({
			store,
			app: pinia._a,
			pinia,
			options: optionsForPlugin
		}));
		assign$2(store, extensions);
	});
	if (initialState && isOptionsStore && options.hydrate) options.hydrate(store.$state, initialState);
	isListening = true;
	isSyncListening = true;
	return store;
}
/*! #__NO_SIDE_EFFECTS__ */
function defineStore(id, setup, setupOptions) {
	let options;
	const isSetupStore = typeof setup === "function";
	options = isSetupStore ? setupOptions : setup;
	function useStore(pinia, hot) {
		const hasContext = hasInjectionContext();
		pinia = pinia || (hasContext ? inject(piniaSymbol, null) : null);
		if (pinia) setActivePinia(pinia);
		pinia = activePinia;
		if (!pinia._s.has(id)) {
			if (isSetupStore) createSetupStore(id, setup, options, pinia);
			else createOptionsStore(id, options, pinia);
		}
		return pinia._s.get(id);
	}
	useStore.$id = id;
	return useStore;
}
// node_modules/vue-router/dist/useApi-CUWMwLLw.js
/*!
* vue-router v5.4.0
* (c) 2026 Eduardo San Martin Morote
* @license MIT
*/
/**
* Checks if a path is absolute, meaning it starts with a `/`.
*
* @param path - path to check
*
* @internal
*/
var isAbsolutePath = (path) => path.startsWith("/");
/**
* Allows differentiating lazy components from functional components and vue-class-component
* @internal
*
* @param component
*/
function isRouteComponent(component) {
	return typeof component === "object" || "displayName" in component || "props" in component || "__vccOpts" in component;
}
function isESModule(obj) {
	return obj.__esModule || obj[Symbol.toStringTag] === "Module" || obj.default && isRouteComponent(obj.default);
}
var assign = Object.assign;
function applyToParams(fn, params) {
	const newParams = {};
	for (const key in params) {
		const value = params[key];
		newParams[key] = isArray(value) ? value.map(fn) : fn(value);
	}
	return newParams;
}
var noop = () => {};
/**
* Typesafe alternative to Array.isArray
* https://github.com/microsoft/TypeScript/pull/48228
*
* @internal
*/
var isArray = Array.isArray;
function mergeOptions(defaults, partialOptions) {
	const options = {};
	for (const key in defaults) options[key] = key in partialOptions ? partialOptions[key] : defaults[key];
	return options;
}
var NavigationFailureSymbol = Symbol("");
/**
* Creates a typed NavigationFailure object.
* @internal
* @param type - NavigationFailureType
* @param params - { from, to }
*/
function createRouterError(type, params) {
	return assign(/* @__PURE__ */ new Error(), {
		type,
		[NavigationFailureSymbol]: true
	}, params);
}
function isNavigationFailure(error, type) {
	return error instanceof Error && NavigationFailureSymbol in error && (type == null || !!(error.type & type));
}
/**
* RouteRecord being rendered by the closest ancestor Router View. Used for
* `onBeforeRouteUpdate` and `onBeforeRouteLeave`. rvlm stands for Router View
* Location Matched
*
* @internal
*/
var matchedRouteKey = Symbol("");
/**
* Allows overriding the router view depth to control which component in
* `matched` is rendered. rvd stands for Router View Depth
*
* @internal
*/
var viewDepthKey = Symbol("");
/**
* Allows overriding the router instance returned by `useRouter` in tests. r
* stands for router
*
* @internal
*/
var routerKey = Symbol("");
/**
* Allows overriding the current route returned by `useRoute` in tests. rl
* stands for route location
*
* @internal
*/
var routeLocationKey = Symbol("");
/**
* Allows overriding the current route used by router-view. Internally this is
* used when the `route` prop is passed.
*
* @internal
*/
var routerViewLocationKey = Symbol("");
/**
* Callbacks called by the closest ancestor router-view once it displays a new
* route. Used by `onRouteRendered()`.
*
* @internal
*/
var routerViewOnRouteRenderedKey = Symbol("");
/**
* Returns the router instance. Equivalent to using `$router` inside
* templates.
*/
function useRouter() {
	return inject(routerKey);
}
/**
* Returns the current route location. Equivalent to using `$route` inside
* templates.
*/
function useRoute(_name) {
	return inject(routeLocationKey);
}
// node_modules/vue-router/dist/devtools-CxgSYwGp.js
/*!
* vue-router v5.4.0
* (c) 2026 Eduardo San Martin Morote
* @license MIT
*/
var isBrowser = typeof document !== "undefined";
/**
* Encoding Rules (␣ = Space)
* - Path: ␣ " < > # ? { }
* - Query: ␣ " < > # & =
* - Hash: ␣ " < > `
*
* On top of that, the RFC3986 (https://tools.ietf.org/html/rfc3986#section-2.2)
* defines some extra characters to be encoded. Most browsers do not encode them
* in encodeURI https://github.com/whatwg/url/issues/369, so it may be safer to
* also encode `!'()*`. Leaving un-encoded only ASCII alphanumeric(`a-zA-Z0-9`)
* plus `-._~`. This extra safety should be applied to query by patching the
* string returned by encodeURIComponent encodeURI also encodes `[\]^`. `\`
* should be encoded to avoid ambiguity. Browsers (IE, FF, C) transform a `\`
* into a `/` if directly typed in. The _backtick_ (`````) should also be
* encoded everywhere because some browsers like FF encode it when directly
* written while others don't. Safari and IE don't encode ``"<>{}``` in hash.
*/
/**
* NOTE: `replaceAll()` is not faster than `replace()` with a global RegExp.
* Benchmarks do not show a clear benefit for these simple replacements:
* https://github.com/mathiasbynens/string-prototype-replace-regexp-benchmark
*/
var HASH_RE = /#/g;
var AMPERSAND_RE = /&/g;
var SLASH_RE = /\//g;
var EQUAL_RE = /=/g;
var IM_RE = /\?/g;
var PLUS_RE = /\+/g;
/**
* NOTE: It's not clear to me if we should encode the + symbol in queries, it
* seems to be less flexible than not doing so and I can't find out the legacy
* systems requiring this for regular requests like text/html. In the standard,
* the encoding of the plus character is only mentioned for
* application/x-www-form-urlencoded
* (https://url.spec.whatwg.org/#urlencoded-parsing) and most browsers seems lo
* leave the plus character as is in queries. To be more flexible, we allow the
* plus character on the query, but it can also be manually encoded by the user.
*
* Resources:
* - https://url.spec.whatwg.org/#urlencoded-parsing
* - https://stackoverflow.com/questions/1634271/url-encoding-the-space-character-or-20
*/
var ENC_BRACKET_OPEN_RE = /%5B/g;
var ENC_BRACKET_CLOSE_RE = /%5D/g;
var ENC_CARET_RE = /%5E/g;
var ENC_BACKTICK_RE = /%60/g;
var ENC_CURLY_OPEN_RE = /%7B/g;
var ENC_PIPE_RE = /%7C/g;
var ENC_CURLY_CLOSE_RE = /%7D/g;
var ENC_SPACE_RE = /%20/g;
/**
* Encode characters that need to be encoded on the path, search and hash
* sections of the URL.
*
* @internal
* @param text - string to encode
* @returns encoded string
*/
function commonEncode(text) {
	return text == null ? "" : encodeURI("" + text).replace(ENC_PIPE_RE, "|").replace(ENC_BRACKET_OPEN_RE, "[").replace(ENC_BRACKET_CLOSE_RE, "]");
}
/**
* Encode characters that need to be encoded on the hash section of the URL.
*
* @param text - string to encode
* @returns encoded string
*/
function encodeHash(text) {
	return commonEncode(text).replace(ENC_CURLY_OPEN_RE, "{").replace(ENC_CURLY_CLOSE_RE, "}").replace(ENC_CARET_RE, "^");
}
/**
* Encode characters that need to be encoded query values on the query
* section of the URL.
*
* @param text - string to encode
* @returns encoded string
*/
function encodeQueryValue(text) {
	return commonEncode(text).replace(PLUS_RE, "%2B").replace(ENC_SPACE_RE, "+").replace(HASH_RE, "%23").replace(AMPERSAND_RE, "%26").replace(ENC_BACKTICK_RE, "`").replace(ENC_CURLY_OPEN_RE, "{").replace(ENC_CURLY_CLOSE_RE, "}").replace(ENC_CARET_RE, "^");
}
/**
* Like `encodeQueryValue` but also encodes the `=` character.
*
* @param text - string to encode
*/
function encodeQueryKey(text) {
	return encodeQueryValue(text).replace(EQUAL_RE, "%3D");
}
/**
* Encode characters that need to be encoded on the path section of the URL.
*
* @param text - string to encode
* @returns encoded string
*/
function encodePath(text) {
	return commonEncode(text).replace(HASH_RE, "%23").replace(IM_RE, "%3F");
}
/**
* Encode characters that need to be encoded on the path section of the URL as a
* param. This function encodes everything {@link encodePath} does plus the
* slash (`/`) character. If `text` is `null` or `undefined`, returns an empty
* string instead.
*
* @param text - string to encode
* @returns encoded string
*/
function encodeParam(text) {
	return encodePath(text).replace(SLASH_RE, "%2F");
}
function decode(text) {
	if (text == null) return null;
	try {
		return decodeURIComponent("" + text);
	} catch {}
	return "" + text;
}
var TRAILING_SLASH_RE = /\/$/;
var removeTrailingSlash = (path) => path.replace(TRAILING_SLASH_RE, "");
/**
* Transforms a URI into a normalized history location
*
* @param parseQuery
* @param location - URI to normalize
* @param currentLocation - current absolute location. Allows resolving relative
* paths. Must start with `/`. Defaults to `/`
* @returns a normalized history location
*/
function parseURL(parseQuery, location, currentLocation = "/") {
	let path, query = {}, searchString = "", hash = "";
	const hashPos = location.indexOf("#");
	let searchPos = location.indexOf("?");
	searchPos = hashPos >= 0 && searchPos > hashPos ? -1 : searchPos;
	if (searchPos >= 0) {
		path = location.slice(0, searchPos);
		searchString = location.slice(searchPos, hashPos > 0 ? hashPos : location.length);
		query = parseQuery(searchString.slice(1));
	}
	if (hashPos >= 0) {
		path = path || location.slice(0, hashPos);
		hash = location.slice(hashPos, location.length);
	}
	path = resolveRelativePath(path != null ? path : location, currentLocation);
	return {
		fullPath: path + searchString + hash,
		path,
		query,
		hash: decode(hash)
	};
}
/**
* Stringifies a URL object
*
* @param stringifyQuery
* @param location
*/
function stringifyURL(stringifyQuery, location) {
	const query = location.query ? stringifyQuery(location.query) : "";
	return location.path + (query && "?") + query + (location.hash || "");
}
/**
* Strips off the base from the beginning of a location.pathname in a non-case-sensitive way.
*
* @param pathname - location.pathname
* @param base - base to strip off
*/
function stripBase(pathname, base) {
	if (!base || !pathname.toLowerCase().startsWith(base.toLowerCase())) return pathname;
	return pathname.slice(base.length) || "/";
}
/**
* Checks if two RouteLocation are equal. This means that both locations are
* pointing towards the same {@link RouteRecord} and that all `params`, `query`
* parameters and `hash` are the same
*
* @param stringifyQuery - A function that takes a query object of type LocationQueryRaw and returns a string representation of it.
* @param a - first {@link RouteLocation}
* @param b - second {@link RouteLocation}
*/
function isSameRouteLocation(stringifyQuery, a, b) {
	const aLastIndex = a.matched.length - 1;
	const bLastIndex = b.matched.length - 1;
	return aLastIndex > -1 && aLastIndex === bLastIndex && isSameRouteRecord(a.matched[aLastIndex], b.matched[bLastIndex]) && isSameRouteLocationParams(a.params, b.params) && stringifyQuery(a.query) === stringifyQuery(b.query) && a.hash === b.hash;
}
/**
* Check if two `RouteRecords` are equal. Takes into account aliases: they are
* considered equal to the `RouteRecord` they are aliasing.
*
* @param a - first {@link RouteRecord}
* @param b - second {@link RouteRecord}
*/
function isSameRouteRecord(a, b) {
	return (a.aliasOf || a) === (b.aliasOf || b);
}
function isSameRouteLocationParams(a, b) {
	if (Object.keys(a).length !== Object.keys(b).length) return false;
	for (var key in a) if (!isSameRouteLocationParamsValue(a[key], b[key])) return false;
	return true;
}
function isSameRouteLocationParamsValue(a, b) {
	return isArray(a) ? isEquivalentArray(a, b) : isArray(b) ? isEquivalentArray(b, a) : (a && a.valueOf()) === (b && b.valueOf());
}
/**
* Check if two arrays are the same or if an array with one single entry is the
* same as another primitive value. Used to check query and parameters
*
* @param a - array of values
* @param b - array of values or a single value
*/
function isEquivalentArray(a, b) {
	return isArray(b) ? a.length === b.length && a.every((value, i) => value === b[i]) : a.length === 1 && a[0] === b;
}
/**
* Resolves a relative path that starts with `.`.
*
* @param to - path location we are resolving
* @param from - currentLocation.path, should start with `/`
*/
function resolveRelativePath(to, from) {
	if (isAbsolutePath(to)) return to;
	if (!to) return from;
	const fromSegments = from.split("/");
	const toSegments = to.split("/");
	const lastToSegment = toSegments[toSegments.length - 1];
	if (lastToSegment === ".." || lastToSegment === ".") toSegments.push("");
	let position = fromSegments.length - 1;
	let toPosition;
	let segment;
	for (toPosition = 0; toPosition < toSegments.length; toPosition++) {
		segment = toSegments[toPosition];
		if (segment === ".") continue;
		if (segment === "..") {
			if (position > 1) position--;
		} else break;
	}
	return fromSegments.slice(0, position).join("/") + "/" + toSegments.slice(toPosition).join("/");
}
/**
* Initial route location where the router is. Can be used in navigation guards
* to differentiate the initial navigation.
*
* @example
* ```js
* import { START_LOCATION } from 'vue-router'
*
* router.beforeEach((to, from) => {
*   if (from === START_LOCATION) {
*     // initial navigation
*   }
* })
* ```
*/
var START_LOCATION_NORMALIZED = {
	path: "/",
	name: void 0,
	params: {},
	query: {},
	hash: "",
	fullPath: "/",
	matched: [],
	meta: {},
	redirectedFrom: void 0
};
/**
* Normalizes a base by removing any trailing slash and reading the base tag if
* present.
*
* @param base - base to normalize
*/
function normalizeBase(base) {
	if (!base) {
		if (isBrowser) {
			const baseEl = document.querySelector("base");
			base = baseEl && baseEl.getAttribute("href") || "/";
			base = base.replace(/^\w+:\/\/[^/]+/, "");
		} else base = "/";
	}
	if (base[0] !== "/" && base[0] !== "#") base = "/" + base;
	return removeTrailingSlash(base);
}
var BEFORE_HASH_RE = /^[^#]+#/;
function createHref(base, location) {
	return base.replace(BEFORE_HASH_RE, "#") + location;
}
function getElementPosition(el, offset) {
	const docRect = document.documentElement.getBoundingClientRect();
	const elRect = el.getBoundingClientRect();
	return {
		behavior: offset.behavior,
		left: elRect.left - docRect.left - (offset.left || 0),
		top: elRect.top - docRect.top - (offset.top || 0)
	};
}
var computeScrollPosition = () => history.scrollRestoration === "manual" ? {
	left: window.scrollX,
	top: window.scrollY
} : null;
function scrollToPosition(position) {
	let scrollToOptions;
	if ("el" in position) {
		const positionEl = position.el;
		const isIdSelector = typeof positionEl === "string" && positionEl.startsWith("#");
		const el = typeof positionEl === "string" ? isIdSelector ? document.getElementById(positionEl.slice(1)) : document.querySelector(positionEl) : positionEl;
		if (!el) return;
		scrollToOptions = getElementPosition(el, position);
	} else scrollToOptions = position;
	if ("scrollBehavior" in document.documentElement.style) window.scrollTo(scrollToOptions);
	else window.scrollTo(scrollToOptions.left != null ? scrollToOptions.left : window.scrollX, scrollToOptions.top != null ? scrollToOptions.top : window.scrollY);
}
function getScrollKey(path, delta) {
	return (history.state ? history.state.position - delta : -1) + path;
}
var scrollPositions = /* @__PURE__ */ new Map();
function saveScrollPosition(key) {
	scrollPositions.set(key, computeScrollPosition());
}
function getSavedScrollPosition(key) {
	const scroll = scrollPositions.get(key);
	scrollPositions.delete(key);
	return scroll;
}
function invalidateScrollPositions(position, replace = false) {
	for (const key of scrollPositions.keys()) {
		const entryPosition = parseInt(key, 10);
		if (entryPosition === position || !replace && entryPosition > position) scrollPositions.delete(key);
	}
}
/**
* ScrollBehavior instance used by the router to compute and restore the scroll
* position when navigating.
*/
function isRouteLocation(route) {
	return typeof route === "string" || route && typeof route === "object";
}
function isRouteName(name) {
	return typeof name === "string" || typeof name === "symbol";
}
/**
* Transforms a queryString into a {@link LocationQuery} object. Accept both, a
* version with the leading `?` and without Should work as URLSearchParams

* @internal
*
* @param search - search string to parse
* @returns a query object
*/
function parseQuery(search) {
	const query = {};
	if (search === "" || search === "?") return query;
	const searchParams = (search[0] === "?" ? search.slice(1) : search).split("&");
	for (let i = 0; i < searchParams.length; ++i) {
		const searchParam = searchParams[i].replace(PLUS_RE, " ");
		const eqPos = searchParam.indexOf("=");
		const key = decode(eqPos < 0 ? searchParam : searchParam.slice(0, eqPos));
		const value = eqPos < 0 ? null : decode(searchParam.slice(eqPos + 1));
		if (key in query) {
			let currentValue = query[key];
			if (!isArray(currentValue)) currentValue = query[key] = [currentValue];
			currentValue.push(value);
		} else query[key] = value;
	}
	return query;
}
/**
* Stringifies a {@link LocationQueryRaw} object. Like `URLSearchParams`, it
* doesn't prepend a `?`
*
* @internal
*
* @param query - query object to stringify
* @returns string version of the query without the leading `?`
*/
function stringifyQuery(query) {
	let search = "";
	for (let key in query) {
		const value = query[key];
		key = encodeQueryKey(key);
		if (value == null) {
			if (value !== void 0) search += (search.length ? "&" : "") + key;
			continue;
		}
		(isArray(value) ? value.map((v) => v && encodeQueryValue(v)) : [value && encodeQueryValue(value)]).forEach((value) => {
			if (value !== void 0) {
				search += (search.length ? "&" : "") + key;
				if (value != null) search += "=" + value;
			}
		});
	}
	return search;
}
/**
* Transforms a {@link LocationQueryRaw} into a {@link LocationQuery} by casting
* numbers into strings, removing keys with an undefined value and replacing
* undefined with null in arrays
*
* @param query - query object to normalize
* @returns a normalized query object
*/
function normalizeQuery(query) {
	const normalizedQuery = {};
	for (const key in query) {
		const value = query[key];
		if (value !== void 0) normalizedQuery[key] = isArray(value) ? value.map((v) => v == null ? null : "" + v) : value == null ? value : "" + value;
	}
	return normalizedQuery;
}
/**
* Create a list of callbacks that can be reset. Used to create before and after navigation guards list
*/
function useCallbacks() {
	let handlers = [];
	function add(handler) {
		handlers.push(handler);
		return () => {
			const i = handlers.indexOf(handler);
			if (i > -1) handlers.splice(i, 1);
		};
	}
	function reset() {
		handlers = [];
	}
	return {
		add,
		list: () => handlers.slice(),
		reset
	};
}
function guardToPromiseFn(guard, to, from, record, name, runWithContext = (fn) => fn()) {
	const enterCallbackArray = record && (record.enterCallbacks[name] = record.enterCallbacks[name] || []);
	return () => new Promise((resolve, reject) => {
		const next = (valid) => {
			if (valid === false) reject(createRouterError(4, {
				from,
				to
			}));
			else if (valid instanceof Error) reject(valid);
			else if (isRouteLocation(valid)) reject(createRouterError(2, {
				from: to,
				to: valid
			}));
			else {
				if (enterCallbackArray && record.enterCallbacks[name] === enterCallbackArray && typeof valid === "function") enterCallbackArray.push(valid);
				resolve();
			}
		};
		const guardReturn = runWithContext(() => guard.call(record && record.instances[name], to, from, next));
		let guardCall = Promise.resolve(guardReturn);
		if (guard.length < 3) guardCall = guardCall.then(next);
		guardCall.catch((err) => reject(err));
	});
}
function extractComponentsGuards(matched, guardType, to, from, runWithContext = (fn) => fn()) {
	const guards = [];
	for (const record of matched) for (const name in record.components) {
		let rawComponent = record.components[name];
		if (guardType !== "beforeRouteEnter" && !record.instances[name]) continue;
		if (isRouteComponent(rawComponent)) {
			const guard = (rawComponent.__vccOpts || rawComponent)[guardType];
			guard && guards.push(guardToPromiseFn(guard, to, from, record, name, runWithContext));
		} else {
			let componentPromise = rawComponent();
			guards.push(() => componentPromise.then((resolved) => {
				if (!resolved) throw new Error(`Couldn't resolve component "${name}" at "${record.path}"`);
				const resolvedComponent = isESModule(resolved) ? resolved.default : resolved;
				record.mods[name] = resolved;
				record.components[name] = resolvedComponent;
				const guard = (resolvedComponent.__vccOpts || resolvedComponent)[guardType];
				return guard && guardToPromiseFn(guard, to, from, record, name, runWithContext)();
			}));
		}
	}
	return guards;
}
/**
* Split the leaving, updating, and entering records.
* @internal
*
* @param  to - Location we are navigating to
* @param from - Location we are navigating from
*/
function extractChangingRecords(to, from) {
	const leavingRecords = [];
	const updatingRecords = [];
	const enteringRecords = [];
	const len = Math.max(from.matched.length, to.matched.length);
	for (let i = 0; i < len; i++) {
		const recordFrom = from.matched[i];
		if (recordFrom) {
			if (to.matched.find((record) => isSameRouteRecord(record, recordFrom))) updatingRecords.push(recordFrom);
			else leavingRecords.push(recordFrom);
		}
		const recordTo = to.matched[i];
		if (recordTo) {
			if (!from.matched.find((record) => isSameRouteRecord(record, recordTo))) enteringRecords.push(recordTo);
		}
	}
	return [
		leavingRecords,
		updatingRecords,
		enteringRecords
	];
}
// node_modules/vue-router/dist/vue-router.js
/*!
* vue-router v5.4.0
* (c) 2026 Eduardo San Martin Morote
* @license MIT
*/
var createBaseLocation = () => location.protocol + "//" + location.host;
/**
* Creates a normalized history location from a window.location object
* @param base - The base path
* @param location - The window.location object
*/
function createCurrentLocation(base, location) {
	const { pathname, search, hash } = location;
	const hashPos = base.indexOf("#");
	if (hashPos > -1) {
		let slicePos = hash.includes(base.slice(hashPos)) ? base.slice(hashPos).length : 1;
		let pathFromHash = hash.slice(slicePos);
		if (pathFromHash[0] !== "/") pathFromHash = "/" + pathFromHash;
		return stripBase(pathFromHash, "");
	}
	return stripBase(pathname, base) + search + hash;
}
function useHistoryListeners(base, historyState, currentLocation, replace) {
	let listeners = [];
	let teardowns = [];
	let pauseState = null;
	const popStateHandler = ({ state }) => {
		const to = createCurrentLocation(base, location);
		const from = currentLocation.value;
		const fromState = historyState.value;
		let delta = 0;
		if (state) {
			currentLocation.value = to;
			historyState.value = state;
			if (pauseState && pauseState === from) {
				pauseState = null;
				return;
			}
			delta = fromState ? state.position - fromState.position : 0;
		} else replace(to);
		listeners.forEach((listener) => {
			listener(currentLocation.value, from, {
				delta,
				type: "pop",
				direction: delta ? delta > 0 ? "forward" : "back" : ""
			});
		});
	};
	function pauseListeners() {
		pauseState = currentLocation.value;
	}
	function listen(callback) {
		listeners.push(callback);
		const teardown = () => {
			const index = listeners.indexOf(callback);
			if (index > -1) listeners.splice(index, 1);
		};
		teardowns.push(teardown);
		return teardown;
	}
	function beforeUnloadListener() {
		const { history } = window;
		if (!history.state) return;
		history.replaceState(assign({}, history.state, { scroll: computeScrollPosition() }), "");
	}
	function destroy() {
		for (const teardown of teardowns) teardown();
		teardowns = [];
		window.removeEventListener("popstate", popStateHandler);
		window.removeEventListener("pagehide", beforeUnloadListener);
	}
	window.addEventListener("popstate", popStateHandler);
	window.addEventListener("pagehide", beforeUnloadListener);
	return {
		pauseListeners,
		listen,
		destroy
	};
}
/**
* Creates a state object
*/
function buildState(back, current, forward, replaced = false) {
	return {
		back,
		current,
		forward,
		replaced,
		position: window.history.length,
		scroll: null
	};
}
function useHistoryStateNavigation(base) {
	const { history, location } = window;
	const currentLocation = { value: createCurrentLocation(base, location) };
	const historyState = { value: history.state };
	if (!historyState.value) changeLocation(currentLocation.value, {
		back: null,
		current: currentLocation.value,
		forward: null,
		position: history.length - 1,
		replaced: true,
		scroll: null
	}, true);
	function changeLocation(to, state, replace) {
		/**
		* if a base tag is provided, and we are on a normal domain, we have to
		* respect the provided `base` attribute because pushState() will use it and
		* potentially erase anything before the `#` like at
		* https://github.com/vuejs/router/issues/685 where a base of
		* `/folder/#` but a base of `/` would erase the `/folder/` section. If
		* there is no host, the `<base>` tag makes no sense and if there isn't a
		* base tag we can just use everything after the `#`.
		*/
		const hashIndex = base.indexOf("#");
		const url = hashIndex > -1 ? (location.host && document.querySelector("base") ? base : base.slice(hashIndex)) + to : createBaseLocation() + base + to;
		try {
			history[replace ? "replaceState" : "pushState"](state, "", url);
			historyState.value = state;
		} catch (err) {
			console.error(err);
			location[replace ? "replace" : "assign"](url);
		}
	}
	function replace(to, data) {
		const state = assign({}, history.state, buildState(historyState.value.back, to, historyState.value.forward, true), data, { position: historyState.value.position });
		changeLocation(to, state, true);
		invalidateScrollPositions(state.position, true);
		currentLocation.value = to;
	}
	function push(to, data) {
		const currentState = assign({}, historyState.value, history.state, {
			forward: to,
			scroll: computeScrollPosition()
		});
		changeLocation(currentState.current, currentState, true);
		changeLocation(to, assign({}, buildState(currentLocation.value, to, null), { position: currentState.position + 1 }, data), false);
		invalidateScrollPositions(currentState.position);
		currentLocation.value = to;
	}
	return {
		location: currentLocation,
		state: historyState,
		push,
		replace
	};
}
/**
* Creates an HTML5 history. Most common history for single page applications.
*
* @param base -
*/
function createWebHistory(base) {
	base = normalizeBase(base);
	const historyNavigation = useHistoryStateNavigation(base);
	const historyListeners = useHistoryListeners(base, historyNavigation.state, historyNavigation.location, historyNavigation.replace);
	function go(delta, triggerListeners = true) {
		if (!triggerListeners) historyListeners.pauseListeners();
		history.go(delta);
	}
	const routerHistory = assign({
		location: "",
		base,
		go,
		createHref: createHref.bind(null, base)
	}, historyNavigation, historyListeners);
	Object.defineProperty(routerHistory, "location", {
		enumerable: true,
		get: () => historyNavigation.location.value
	});
	Object.defineProperty(routerHistory, "state", {
		enumerable: true,
		get: () => historyNavigation.state.value
	});
	return routerHistory;
}
/**
* Creates a hash history. Useful for web applications with no host (e.g. `file://`) or when configuring a server to
* handle any URL is not possible.
*
* @param base - optional base to provide. Defaults to `location.pathname + location.search` If there is a `<base>` tag
* in the `head`, its value will be ignored in favor of this parameter **but note it affects all the history.pushState()
* calls**, meaning that if you use a `<base>` tag, it's `href` value **has to match this parameter** (ignoring anything
* after the `#`).
*
* @example
* ```js
* // at https://example.com/folder
* createWebHashHistory() // gives a url of `https://example.com/folder#`
* createWebHashHistory('/folder/') // gives a url of `https://example.com/folder/#`
* // if the `#` is provided in the base, it won't be added by `createWebHashHistory`
* createWebHashHistory('/folder/#/app/') // gives a url of `https://example.com/folder/#/app/`
* // you should avoid doing this because it changes the original url and breaks copying urls
* createWebHashHistory('/other-folder/') // gives a url of `https://example.com/other-folder/#`
*
* // at file:///usr/etc/folder/index.html
* // for locations with no `host`, the base is ignored
* createWebHashHistory('/iAmIgnored') // gives a url of `file:///usr/etc/folder/index.html#`
* ```
*/
function createWebHashHistory(base) {
	base = location.host ? base || location.pathname + location.search : "";
	if (!base.includes("#")) base += "#";
	return createWebHistory(base);
}
var ROOT_TOKEN = {
	type: 0,
	value: ""
};
var VALID_PARAM_RE = /[a-zA-Z0-9_]/;
function tokenizePath(path) {
	if (!path) return [[]];
	if (path === "/") return [[ROOT_TOKEN]];
	if (!isAbsolutePath(path)) throw new Error(`Invalid path "${path}"`);
	function crash(message) {
		throw new Error(`ERR (${state})/"${buffer}": ${message}`);
	}
	let state = 0;
	let previousState = state;
	const tokens = [];
	let segment;
	function finalizeSegment() {
		if (segment) tokens.push(segment);
		segment = [];
	}
	let i = 0;
	let char;
	let buffer = "";
	let customRe = "";
	function consumeBuffer() {
		if (!buffer) return;
		if (state === 0) segment.push({
			type: 0,
			value: buffer
		});
		else if (state === 1 || state === 2 || state === 3) {
			if (segment.length > 1 && (char === "*" || char === "+")) crash(`A repeatable param (${buffer}) must be alone in its segment. eg: '/:ids+.`);
			segment.push({
				type: 1,
				value: buffer,
				regexp: customRe,
				repeatable: char === "*" || char === "+",
				optional: char === "*" || char === "?"
			});
		} else crash("Invalid state to consume buffer");
		buffer = "";
	}
	function addCharToBuffer() {
		buffer += char;
	}
	while (i < path.length) {
		char = path[i++];
		switch (state) {
			case 0:
				if (char === "\\") {
					previousState = state;
					state = 4;
				} else if (char === "/") {
					if (buffer) consumeBuffer();
					finalizeSegment();
				} else if (char === ":") {
					consumeBuffer();
					state = 1;
				} else addCharToBuffer();
				break;
			case 4:
				addCharToBuffer();
				state = previousState;
				break;
			case 1:
				if (char === "(") state = 2;
				else if (VALID_PARAM_RE.test(char)) addCharToBuffer();
				else {
					consumeBuffer();
					state = 0;
					if (char !== "*" && char !== "?" && char !== "+") i--;
				}
				break;
			case 2:
				if (char === ")") {
					if (customRe[customRe.length - 1] == "\\") customRe = customRe.slice(0, -1) + char;
					else state = 3;
				} else customRe += char;
				break;
			case 3:
				consumeBuffer();
				state = 0;
				if (char !== "*" && char !== "?" && char !== "+") i--;
				customRe = "";
				break;
			default: crash("Unknown state");
		}
	}
	if (state === 2) crash(`Unfinished custom RegExp for param "${buffer}"`);
	consumeBuffer();
	finalizeSegment();
	return tokens;
}
var BASE_PARAM_PATTERN = "[^/]+?";
var BASE_PATH_PARSER_OPTIONS = {
	sensitive: false,
	strict: false,
	start: true,
	end: true
};
var REGEX_CHARS_RE = /[.+*?^${}()[\]/\\]/g;
/**
* Creates a path parser from an array of Segments (a segment is an array of Tokens)
*
* @param segments - array of segments returned by tokenizePath
* @param extraOptions - optional options for the regexp
* @returns a PathParser
*/
function tokensToParser(segments, extraOptions) {
	const options = assign({}, BASE_PATH_PARSER_OPTIONS, extraOptions);
	const score = [];
	let pattern = options.start ? "^" : "";
	const keys = [];
	for (const segment of segments) {
		const segmentScores = segment.length ? [] : [90];
		if (options.strict && !segment.length) pattern += "/";
		for (let tokenIndex = 0; tokenIndex < segment.length; tokenIndex++) {
			const token = segment[tokenIndex];
			let subSegmentScore = 40 + (options.sensitive ? .25 : 0);
			if (token.type === 0) {
				if (!tokenIndex) pattern += "/";
				pattern += token.value.replace(REGEX_CHARS_RE, "\\$&");
				subSegmentScore += 40;
			} else if (token.type === 1) {
				const { value, repeatable, optional, regexp } = token;
				keys.push({
					name: value,
					repeatable,
					optional
				});
				const re = regexp ? regexp : BASE_PARAM_PATTERN;
				if (re !== BASE_PARAM_PATTERN) {
					subSegmentScore += 10;
					try {
						new RegExp(`(${re})`);
					} catch (err) {
						throw new Error(`Invalid custom RegExp for param "${value}" (${re}): ` + err.message);
					}
				}
				let subPattern = repeatable ? `((?:${re})(?:/(?:${re}))*)` : `(${re})`;
				if (!tokenIndex) subPattern = optional && segment.length < 2 ? `(?:/${subPattern})` : "/" + subPattern;
				if (optional) subPattern += "?";
				pattern += subPattern;
				subSegmentScore += 20;
				if (optional) subSegmentScore += -8;
				if (repeatable) subSegmentScore += -20;
				if (re === ".*") subSegmentScore += -50;
			}
			segmentScores.push(subSegmentScore);
		}
		score.push(segmentScores);
	}
	if (options.strict && options.end) {
		const i = score.length - 1;
		score[i][score[i].length - 1] += .7000000000000001;
	}
	if (!options.strict) pattern += "/?";
	if (options.end) pattern += "$";
	else if (options.strict && !pattern.endsWith("/")) pattern += "(?:/|$)";
	const re = new RegExp(pattern, options.sensitive ? "" : "i");
	function parse(path) {
		const match = path.match(re);
		const params = {};
		if (!match) return null;
		for (let i = 1; i < match.length; i++) {
			const value = match[i] || "";
			const key = keys[i - 1];
			params[key.name] = value && key.repeatable ? value.split("/") : value;
		}
		return params;
	}
	function stringify(params) {
		let path = "";
		let avoidDuplicatedSlash = false;
		for (const segment of segments) {
			if (!avoidDuplicatedSlash || !path.endsWith("/")) path += "/";
			avoidDuplicatedSlash = false;
			for (const token of segment) if (token.type === 0) path += token.value;
			else if (token.type === 1) {
				const { value, repeatable, optional } = token;
				const param = value in params ? params[value] : "";
				if (isArray(param) && !repeatable) throw new Error(`Provided param "${value}" is an array but it is not repeatable (* or + modifiers)`);
				const text = isArray(param) ? param.join("/") : param;
				if (!text) {
					if (optional) {
						if (segment.length < 2) {
							if (path.endsWith("/")) path = path.slice(0, -1);
							else avoidDuplicatedSlash = true;
						}
					} else throw new Error(`Missing required param "${value}"`);
				}
				path += text;
			}
		}
		return path || "/";
	}
	return {
		re,
		score,
		keys,
		parse,
		stringify
	};
}
/**
* Compares an array of numbers as used in PathParser.score and returns a
* number. This function can be used to `sort` an array
*
* @param a - first array of numbers
* @param b - second array of numbers
* @returns 0 if both are equal, < 0 if a should be sorted first, > 0 if b
* should be sorted first
*/
function compareScoreArray(a, b) {
	let i = 0;
	while (i < a.length && i < b.length) {
		const diff = b[i] - a[i];
		if (diff) return diff;
		i++;
	}
	if (a.length < b.length) return a.length === 1 && a[0] === 80 ? -1 : 1;
	else if (a.length > b.length) return b.length === 1 && b[0] === 80 ? 1 : -1;
	return 0;
}
/**
* Compare function that can be used with `sort` to sort an array of PathParser
*
* @param a - first PathParser
* @param b - second PathParser
* @returns 0 if both are equal, < 0 if a should be sorted first, > 0 if b
*/
function comparePathParserScore(a, b) {
	let i = 0;
	const aScore = a.score;
	const bScore = b.score;
	while (i < aScore.length && i < bScore.length) {
		const comp = compareScoreArray(aScore[i], bScore[i]);
		if (comp) return comp;
		i++;
	}
	if (Math.abs(bScore.length - aScore.length) === 1) {
		if (isLastScoreNegative(aScore)) return 1;
		if (isLastScoreNegative(bScore)) return -1;
	}
	return bScore.length - aScore.length;
}
/**
* This allows detecting splats at the end of a path: /home/:id(.*)*
*
* @param score - score to check
* @returns true if the last entry is negative
*/
function isLastScoreNegative(score) {
	const last = score[score.length - 1];
	return score.length > 0 && last[last.length - 1] < 0;
}
var PATH_PARSER_OPTIONS_DEFAULTS = {
	strict: false,
	end: true,
	sensitive: false
};
function createRouteRecordMatcher(record, parent, options) {
	const matcher = assign(tokensToParser(tokenizePath(record.path), options), {
		record,
		parent,
		children: [],
		alias: []
	});
	if (parent) {
		if (!matcher.record.aliasOf === !parent.record.aliasOf) parent.children.push(matcher);
	}
	return matcher;
}
/**
* Creates a Router Matcher.
*
* @internal
* @param routes - array of initial routes
* @param globalOptions - global route options
*/
function createRouterMatcher(routes, globalOptions) {
	const matchers = [];
	const matcherMap = /* @__PURE__ */ new Map();
	globalOptions = mergeOptions(PATH_PARSER_OPTIONS_DEFAULTS, globalOptions);
	function getRecordMatcher(name) {
		return matcherMap.get(name);
	}
	function addRoute(record, parent, originalRecord) {
		const isRootAdd = !originalRecord;
		const mainNormalizedRecord = normalizeRouteRecord(record);
		mainNormalizedRecord.aliasOf = originalRecord && originalRecord.record;
		const options = mergeOptions(globalOptions, record);
		const normalizedRecords = [mainNormalizedRecord];
		if ("alias" in record) {
			const aliases = typeof record.alias === "string" ? [record.alias] : record.alias;
			for (const alias of aliases) normalizedRecords.push(normalizeRouteRecord(assign({}, mainNormalizedRecord, {
				components: originalRecord ? originalRecord.record.components : mainNormalizedRecord.components,
				path: alias,
				aliasOf: originalRecord ? originalRecord.record : mainNormalizedRecord
			})));
		}
		let matcher;
		let originalMatcher;
		for (const normalizedRecord of normalizedRecords) {
			const { path } = normalizedRecord;
			if (parent && !isAbsolutePath(path)) {
				const parentPath = parent.record.path;
				const connectingSlash = parentPath[parentPath.length - 1] === "/" ? "" : "/";
				normalizedRecord.path = parent.record.path + (path && connectingSlash + path);
			}
			matcher = createRouteRecordMatcher(normalizedRecord, parent, options);
			if (originalRecord) originalRecord.alias.push(matcher);
			else {
				originalMatcher = originalMatcher || matcher;
				if (originalMatcher !== matcher) originalMatcher.alias.push(matcher);
				if (isRootAdd && record.name && !isAliasRecord(matcher)) removeRoute(record.name);
			}
			if (isMatchable(matcher)) insertMatcher(matcher);
			if (mainNormalizedRecord.children) {
				const children = mainNormalizedRecord.children;
				for (let i = 0; i < children.length; i++) addRoute(children[i], matcher, originalRecord && originalRecord.children[i]);
			}
			originalRecord = originalRecord || matcher;
		}
		return originalMatcher ? () => {
			removeRoute(originalMatcher);
		} : noop;
	}
	function removeRoute(matcherRef) {
		if (isRouteName(matcherRef)) {
			const matcher = matcherMap.get(matcherRef);
			if (matcher) {
				matcherMap.delete(matcherRef);
				matchers.splice(matchers.indexOf(matcher), 1);
				matcher.children.forEach(removeRoute);
				matcher.alias.forEach(removeRoute);
			}
		} else {
			const index = matchers.indexOf(matcherRef);
			if (index > -1) {
				matchers.splice(index, 1);
				if (matcherRef.record.name) matcherMap.delete(matcherRef.record.name);
				matcherRef.children.forEach(removeRoute);
				matcherRef.alias.forEach(removeRoute);
			}
		}
	}
	function getRoutes() {
		return matchers;
	}
	function insertMatcher(matcher) {
		const index = findInsertionIndex(matcher, matchers);
		matchers.splice(index, 0, matcher);
		if (matcher.record.name && !isAliasRecord(matcher)) matcherMap.set(matcher.record.name, matcher);
	}
	function resolve(location, currentLocation) {
		let matcher;
		let params = {};
		let path;
		let name;
		if ("name" in location && location.name) {
			matcher = matcherMap.get(location.name);
			if (!matcher) throw createRouterError(1, { location });
			name = matcher.record.name;
			params = assign(pickParams(currentLocation.params, matcher.keys.filter((k) => !k.optional).concat(matcher.parent ? matcher.parent.keys.filter((k) => k.optional) : []).map((k) => k.name)), location.params && pickParams(location.params, matcher.keys.map((k) => k.name)));
			path = matcher.stringify(params);
		} else if (location.path != null) {
			path = location.path;
			matcher = matchers.find((m) => m.re.test(path));
			if (matcher) {
				params = matcher.parse(path);
				name = matcher.record.name;
				matcher.keys.forEach((key) => {
					if (key.optional && !params[key.name]) delete params[key.name];
				});
			}
		} else {
			matcher = currentLocation.name ? matcherMap.get(currentLocation.name) : matchers.find((m) => m.re.test(currentLocation.path));
			if (!matcher) throw createRouterError(1, {
				location,
				currentLocation
			});
			name = matcher.record.name;
			params = assign({}, currentLocation.params, location.params);
			path = matcher.stringify(params);
		}
		const matched = [];
		let parentMatcher = matcher;
		while (parentMatcher) {
			matched.unshift(parentMatcher.record);
			parentMatcher = parentMatcher.parent;
		}
		return {
			name,
			path,
			params,
			matched,
			meta: mergeMetaFields(matched)
		};
	}
	routes.forEach((route) => addRoute(route));
	function clearRoutes() {
		matchers.length = 0;
		matcherMap.clear();
	}
	return {
		addRoute,
		resolve,
		removeRoute,
		clearRoutes,
		getRoutes,
		getRecordMatcher
	};
}
/**
* Picks an object param to contain only specified keys.
*
* @param params - params object to pick from
* @param keys - keys to pick
*/
function pickParams(params, keys) {
	const newParams = {};
	for (const key of keys) if (key in params) newParams[key] = params[key];
	return newParams;
}
/**
* Normalizes a RouteRecordRaw. Creates a copy
*
* @param record
* @returns the normalized version
*/
function normalizeRouteRecord(record) {
	const normalized = {
		path: record.path,
		redirect: record.redirect,
		name: record.name,
		meta: record.meta || {},
		aliasOf: record.aliasOf,
		beforeEnter: record.beforeEnter,
		props: normalizeRecordProps(record),
		children: record.children || [],
		instances: {},
		leaveGuards: /* @__PURE__ */ new Set(),
		updateGuards: /* @__PURE__ */ new Set(),
		enterCallbacks: {},
		components: "components" in record ? record.components || null : record.component && { default: record.component }
	};
	Object.defineProperty(normalized, "mods", { value: {} });
	return normalized;
}
/**
* Normalize the optional `props` in a record to always be an object similar to
* components. Also accept a boolean for components.
* @param record
*/
function normalizeRecordProps(record) {
	const propsObject = {};
	const props = record.props || false;
	if ("component" in record) propsObject.default = props;
	else for (const name in record.components) propsObject[name] = typeof props === "object" ? props[name] : props;
	return propsObject;
}
/**
* Checks if a record or any of its parent is an alias
* @param record
*/
function isAliasRecord(record) {
	while (record) {
		if (record.record.aliasOf) return true;
		record = record.parent;
	}
	return false;
}
/**
* Merge meta fields of an array of records
*
* @param matched - array of matched records
*/
function mergeMetaFields(matched) {
	return matched.reduce((meta, record) => assign(meta, record.meta), {});
}
/**
* Performs a binary search to find the correct insertion index for a new matcher.
*
* Matchers are primarily sorted by their score. If scores are tied then we also consider parent/child relationships,
* with descendants coming before ancestors. If there's still a tie, new routes are inserted after existing routes.
*
* @param matcher - new matcher to be inserted
* @param matchers - existing matchers
*/
function findInsertionIndex(matcher, matchers) {
	let lower = 0;
	let upper = matchers.length;
	while (lower !== upper) {
		const mid = lower + upper >> 1;
		if (comparePathParserScore(matcher, matchers[mid]) < 0) upper = mid;
		else lower = mid + 1;
	}
	const insertionAncestor = getInsertionAncestor(matcher);
	if (insertionAncestor) upper = matchers.lastIndexOf(insertionAncestor, upper - 1);
	return upper;
}
function getInsertionAncestor(matcher) {
	let ancestor = matcher;
	while (ancestor = ancestor.parent) if (isMatchable(ancestor) && comparePathParserScore(matcher, ancestor) === 0) return ancestor;
}
/**
* Checks if a matcher can be reachable. This means if it's possible to reach it as a route. For example, routes without
* a component, or name, or redirect, are just used to group other routes.
* @param matcher
* @param matcher.record record of the matcher
* @returns
*/
function isMatchable({ record }) {
	return !!(record.name || record.components && Object.keys(record.components).length || record.redirect);
}
/**
* Returns the internal behavior of a {@link RouterLink} without the rendering part.
*
* @param props - a `to` location and an optional `replace` flag
*/
function useLink(props) {
	const router = inject(routerKey);
	const currentRoute = inject(routeLocationKey);
	const route = computed(() => {
		const to = unref(props.to);
		return router.resolve(to);
	});
	const activeRecordIndex = computed(() => {
		const { matched } = route.value;
		const { length } = matched;
		const routeMatched = matched[length - 1];
		const currentMatched = currentRoute.matched;
		if (!routeMatched || !currentMatched.length) return -1;
		const index = currentMatched.findIndex(isSameRouteRecord.bind(null, routeMatched));
		if (index > -1) return index;
		const parentRecordPath = getOriginalPath(matched[length - 2]);
		return length > 1 && getOriginalPath(routeMatched) === parentRecordPath && currentMatched[currentMatched.length - 1].path !== parentRecordPath ? currentMatched.findIndex(isSameRouteRecord.bind(null, matched[length - 2])) : index;
	});
	const isActive = computed(() => activeRecordIndex.value > -1 && includesParams(currentRoute.params, route.value.params));
	const isExactActive = computed(() => activeRecordIndex.value > -1 && activeRecordIndex.value === currentRoute.matched.length - 1 && isSameRouteLocationParams(currentRoute.params, route.value.params));
	function navigate(e = {}) {
		if (guardEvent(e)) {
			const p = router[unref(props.replace) ? "replace" : "push"](unref(props.to)).catch(noop);
			if (props.viewTransition && typeof document !== "undefined" && "startViewTransition" in document) document.startViewTransition(() => p);
			return p;
		}
		return Promise.resolve();
	}
	/**
	* NOTE: update {@link _RouterLinkI}'s `$slots` type when updating this
	*/
	return {
		route,
		href: computed(() => route.value.href),
		isActive,
		isExactActive,
		navigate
	};
}
function preferSingleVNode(vnodes) {
	return vnodes.length === 1 ? vnodes[0] : vnodes;
}
/**
* Component to render a link that triggers a navigation on click.
*/
var RouterLink = /* @__PURE__ */ defineComponent({
	name: "RouterLink",
	compatConfig: { MODE: 3 },
	props: {
		to: {
			type: [String, Object],
			required: true
		},
		replace: Boolean,
		activeClass: String,
		exactActiveClass: String,
		custom: Boolean,
		ariaCurrentValue: {
			type: String,
			default: "page"
		},
		viewTransition: Boolean
	},
	useLink,
	setup(props, { slots }) {
		const link = /* @__PURE__ */ reactive(useLink(props));
		const { options } = inject(routerKey);
		const elClass = computed(() => ({
			[getLinkClass(props.activeClass, options.linkActiveClass, "router-link-active")]: link.isActive,
			[getLinkClass(props.exactActiveClass, options.linkExactActiveClass, "router-link-exact-active")]: link.isExactActive
		}));
		return () => {
			const children = slots.default && preferSingleVNode(slots.default(link));
			return props.custom ? children : h("a", {
				"aria-current": link.isExactActive ? props.ariaCurrentValue : null,
				href: link.href,
				onClick: link.navigate,
				class: elClass.value
			}, children);
		};
	}
});
function guardEvent(e) {
	if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
	if (e.defaultPrevented) return;
	if (e.button !== void 0 && e.button !== 0) return;
	if (e.currentTarget && e.currentTarget.getAttribute) {
		const target = e.currentTarget.getAttribute("target");
		if (/\b_blank\b/i.test(target)) return;
	}
	if (e.preventDefault) e.preventDefault();
	return true;
}
function includesParams(outer, inner) {
	for (const key in inner) {
		const innerValue = inner[key];
		const outerValue = outer[key];
		if (isArray(innerValue)) {
			if (!isArray(outerValue) || outerValue.length !== innerValue.length || innerValue.some((value, i) => value.valueOf() !== outerValue[i].valueOf())) return false;
		} else if (innerValue !== outerValue) return false;
	}
	return true;
}
/**
* Get the original path value of a record by following its aliasOf
* @param record
*/
function getOriginalPath(record) {
	return record ? record.aliasOf ? record.aliasOf.path : record.path : "";
}
/**
* Utility class to get the active class based on defaults.
* @param propClass
* @param globalClass
* @param defaultClass
*/
var getLinkClass = (propClass, globalClass, defaultClass) => propClass != null ? propClass : globalClass != null ? globalClass : defaultClass;
var RouterViewImpl = /*#__PURE__*/ defineComponent({
	name: "RouterView",
	inheritAttrs: false,
	props: {
		name: {
			type: String,
			default: "default"
		},
		route: Object
	},
	compatConfig: { MODE: 3 },
	setup(props, { attrs, slots }) {
		const injectedRoute = inject(routerViewLocationKey);
		const routeToDisplay = computed(() => props.route || injectedRoute.value);
		const injectedDepth = inject(viewDepthKey, 0);
		const depth = computed(() => {
			let initialDepth = unref(injectedDepth);
			const { matched } = routeToDisplay.value;
			let matchedRoute;
			while ((matchedRoute = matched[initialDepth]) && !matchedRoute.components) initialDepth++;
			return initialDepth;
		});
		const matchedRouteRef = computed(() => routeToDisplay.value.matched[depth.value]);
		provide(viewDepthKey, computed(() => depth.value + 1));
		provide(matchedRouteKey, matchedRouteRef);
		provide(routerViewLocationKey, routeToDisplay);
		const onRouteRenderedCallbacks = /* @__PURE__ */ new Set();
		provide(routerViewOnRouteRenderedKey, onRouteRenderedCallbacks);
		const viewRef = /* @__PURE__ */ ref();
		let settledRoute = START_LOCATION_NORMALIZED;
		const { app } = getCurrentInstance().appContext;
		watch(() => [
			viewRef.value,
			matchedRouteRef.value,
			props.name
		], ([instance, to, name], [oldInstance, from, _oldName]) => {
			if (to) {
				to.instances[name] = instance;
				if (from && from !== to && instance && instance === oldInstance) {
					if (!to.leaveGuards.size) to.leaveGuards = from.leaveGuards;
					if (!to.updateGuards.size) to.updateGuards = from.updateGuards;
				}
			}
			if (instance && to && (!from || !isSameRouteRecord(to, from) || !oldInstance)) (to.enterCallbacks[name] || []).forEach((callback) => callback(instance));
		}, { flush: "post" });
		return () => {
			const route = routeToDisplay.value;
			const currentName = props.name;
			const matchedRoute = matchedRouteRef.value;
			const ViewComponent = matchedRoute && matchedRoute.components[currentName];
			if (!ViewComponent) return normalizeSlot(slots.default, {
				Component: ViewComponent,
				route
			});
			const routePropsOption = matchedRoute.props[currentName];
			const routeProps = routePropsOption ? routePropsOption === true ? route.params : typeof routePropsOption === "function" ? routePropsOption(route) : routePropsOption : null;
			const onVnodeUnmounted = (vnode) => {
				if (vnode.component.isUnmounted) matchedRoute.instances[currentName] = null;
			};
			const onVnodeSettled = (vnode) => nextTick(() => {
				if (settledRoute === route || routeToDisplay.value !== route || vnode.el.getRootNode() !== app._container.getRootNode()) return;
				const from = settledRoute;
				settledRoute = route;
				for (const callback of onRouteRenderedCallbacks) callback(route, from);
			});
			const component = h(ViewComponent, assign({}, routeProps, attrs, {
				onVnodeUnmounted,
				onVnodeMounted: onVnodeSettled,
				onVnodeUpdated: onVnodeSettled,
				ref: viewRef
			}));
			return normalizeSlot(slots.default, {
				Component: component,
				route
			}) || component;
		};
	}
});
function normalizeSlot(slot, data) {
	if (!slot) return null;
	const slotContent = slot(data);
	return slotContent.length === 1 ? slotContent[0] : slotContent;
}
/**
* Component to display the current route the user is at.
*/
var RouterView = RouterViewImpl;
/**
* Creates a Router instance that can be used by a Vue app.
*
* @param options - {@link RouterOptions}
*/
function createRouter(options) {
	const matcher = options.matcher || createRouterMatcher(options.routes, options);
	const parseQuery$1 = options.parseQuery || parseQuery;
	const stringifyQuery$1 = options.stringifyQuery || stringifyQuery;
	const routerHistory = options.history;
	const beforeGuards = useCallbacks();
	const beforeResolveGuards = useCallbacks();
	const afterGuards = useCallbacks();
	const currentRoute = /* @__PURE__ */ shallowRef(START_LOCATION_NORMALIZED);
	const routesVersion = /* @__PURE__ */ shallowRef(0);
	let pendingLocation = START_LOCATION_NORMALIZED;
	if (isBrowser && options.scrollBehavior && "scrollRestoration" in history) history.scrollRestoration = "manual";
	const normalizeParams = applyToParams.bind(null, (paramValue) => "" + paramValue);
	const encodeParams = applyToParams.bind(null, encodeParam);
	const decodeParams = applyToParams.bind(null, decode);
	function addRoute(parentOrRoute, route) {
		let parent;
		let record;
		if (isRouteName(parentOrRoute)) {
			parent = matcher.getRecordMatcher(parentOrRoute);
			record = route;
		} else record = parentOrRoute;
		const removeRoute = matcher.addRoute(record, parent);
		routesVersion.value++;
		return () => {
			removeRoute();
			routesVersion.value++;
		};
	}
	function removeRoute(name) {
		const recordMatcher = matcher.getRecordMatcher(name);
		if (recordMatcher) {
			matcher.removeRoute(recordMatcher);
			routesVersion.value++;
		}
	}
	function clearRoutes() {
		matcher.clearRoutes();
		routesVersion.value++;
	}
	function getRoutes() {
		return matcher.getRoutes().map((routeMatcher) => routeMatcher.record);
	}
	function hasRoute(name) {
		return !!matcher.getRecordMatcher(name);
	}
	function resolve(rawLocation, currentLocation) {
		routesVersion.value;
		if (typeof rawLocation === "string") {
			currentLocation = currentLocation || (rawLocation.startsWith("/") ? START_LOCATION_NORMALIZED : currentRoute.value);
			const locationNormalized = parseURL(parseQuery$1, rawLocation, currentLocation.path);
			const matchedRoute = matcher.resolve({ path: locationNormalized.path }, currentLocation);
			const href = routerHistory.createHref(locationNormalized.fullPath);
			return assign(locationNormalized, matchedRoute, {
				params: decodeParams(matchedRoute.params),
				redirectedFrom: void 0,
				href
			});
		}
		currentLocation = assign({}, currentLocation || (rawLocation.path != null && rawLocation.path.startsWith("/") && !("name" in rawLocation && rawLocation.name) ? START_LOCATION_NORMALIZED : currentRoute.value));
		let matcherLocation;
		if (rawLocation.path != null) matcherLocation = assign({}, rawLocation, { path: parseURL(parseQuery$1, rawLocation.path, currentLocation.path).path });
		else {
			const targetParams = assign({}, rawLocation.params);
			for (const key in targetParams) if (targetParams[key] == null) delete targetParams[key];
			matcherLocation = assign({}, rawLocation, { params: encodeParams(targetParams) });
			currentLocation.params = encodeParams(currentLocation.params);
		}
		const matchedRoute = matcher.resolve(matcherLocation, currentLocation);
		const hash = rawLocation.hash || "";
		matchedRoute.params = normalizeParams(decodeParams(matchedRoute.params));
		const fullPath = stringifyURL(stringifyQuery$1, assign({}, rawLocation, {
			hash: encodeHash(hash),
			path: matchedRoute.path
		}));
		const href = routerHistory.createHref(fullPath);
		return assign({
			fullPath,
			hash,
			query: stringifyQuery$1 === stringifyQuery ? normalizeQuery(rawLocation.query) : rawLocation.query || {}
		}, matchedRoute, {
			redirectedFrom: void 0,
			href
		});
	}
	function locationAsObject(to) {
		return typeof to === "string" ? parseURL(parseQuery$1, to, currentRoute.value.path) : assign({}, to);
	}
	function checkCanceledNavigation(to, from) {
		if (pendingLocation !== to) return createRouterError(8, {
			from,
			to
		});
	}
	function push(to) {
		return pushWithRedirect(to);
	}
	function replace(to) {
		return push(assign(locationAsObject(to), { replace: true }));
	}
	function handleRedirectRecord(to, from) {
		const lastMatched = to.matched[to.matched.length - 1];
		if (lastMatched && lastMatched.redirect) {
			const { redirect } = lastMatched;
			let newTargetLocation = typeof redirect === "function" ? redirect(to, from) : redirect;
			if (typeof newTargetLocation === "string") {
				newTargetLocation = newTargetLocation.includes("?") || newTargetLocation.includes("#") ? newTargetLocation = locationAsObject(newTargetLocation) : { path: newTargetLocation };
				newTargetLocation.params = {};
			}
			return assign({
				query: to.query,
				hash: to.hash,
				params: newTargetLocation.path != null ? {} : to.params
			}, newTargetLocation);
		}
	}
	function pushWithRedirect(to, redirectedFrom) {
		const targetLocation = pendingLocation = resolve(to);
		const from = currentRoute.value;
		const data = to.state;
		const force = to.force;
		const replace = to.replace === true;
		const shouldRedirect = handleRedirectRecord(targetLocation, from);
		if (shouldRedirect) return pushWithRedirect(assign(locationAsObject(shouldRedirect), {
			state: typeof shouldRedirect === "object" ? assign({}, data, shouldRedirect.state) : data,
			force,
			replace
		}), redirectedFrom || targetLocation);
		const toLocation = targetLocation;
		toLocation.redirectedFrom = redirectedFrom;
		let failure;
		if (!force && isSameRouteLocation(stringifyQuery$1, from, targetLocation)) {
			failure = createRouterError(16, {
				to: toLocation,
				from
			});
			handleScroll(from, from, true, false);
		}
		return (failure ? Promise.resolve(failure) : navigate(toLocation, from)).catch((error) => isNavigationFailure(error) ? isNavigationFailure(error, 2) ? error : markAsReady(error) : triggerError(error, toLocation, from)).then((failure) => {
			if (failure) {
				if (isNavigationFailure(failure, 2)) return pushWithRedirect(assign({ replace }, locationAsObject(failure.to), {
					state: typeof failure.to === "object" ? assign({}, data, failure.to.state) : data,
					force
				}), redirectedFrom || toLocation);
			} else failure = finalizeNavigation(toLocation, from, true, replace, data);
			triggerAfterEach(toLocation, from, failure);
			return failure;
		});
	}
	/**
	* Helper to reject and skip all navigation guards if a new navigation happened
	* @param to
	* @param from
	*/
	function checkCanceledNavigationAndReject(to, from) {
		const error = checkCanceledNavigation(to, from);
		return error ? Promise.reject(error) : Promise.resolve();
	}
	function runWithContext(fn) {
		const app = installedApps.values().next().value;
		return app && typeof app.runWithContext === "function" ? app.runWithContext(fn) : fn();
	}
	function navigate(to, from) {
		let guards;
		const [leavingRecords, updatingRecords, enteringRecords] = extractChangingRecords(to, from);
		guards = extractComponentsGuards(leavingRecords.reverse(), "beforeRouteLeave", to, from);
		for (const record of leavingRecords) record.leaveGuards.forEach((guard) => {
			guards.push(guardToPromiseFn(guard, to, from));
		});
		const canceledNavigationCheck = checkCanceledNavigationAndReject.bind(null, to, from);
		guards.push(canceledNavigationCheck);
		return runGuardQueue(guards).then(() => {
			guards = [];
			for (const guard of beforeGuards.list()) guards.push(guardToPromiseFn(guard, to, from));
			guards.push(canceledNavigationCheck);
			return runGuardQueue(guards);
		}).then(() => {
			guards = extractComponentsGuards(updatingRecords, "beforeRouteUpdate", to, from);
			for (const record of updatingRecords) record.updateGuards.forEach((guard) => {
				guards.push(guardToPromiseFn(guard, to, from));
			});
			guards.push(canceledNavigationCheck);
			return runGuardQueue(guards);
		}).then(() => {
			guards = [];
			for (const record of enteringRecords) if (record.beforeEnter) {
				if (isArray(record.beforeEnter)) for (const beforeEnter of record.beforeEnter) guards.push(guardToPromiseFn(beforeEnter, to, from));
				else guards.push(guardToPromiseFn(record.beforeEnter, to, from));
			}
			guards.push(canceledNavigationCheck);
			return runGuardQueue(guards);
		}).then(() => {
			to.matched.forEach((record) => record.enterCallbacks = {});
			guards = extractComponentsGuards(enteringRecords, "beforeRouteEnter", to, from, runWithContext);
			guards.push(canceledNavigationCheck);
			return runGuardQueue(guards);
		}).then(() => {
			guards = [];
			for (const guard of beforeResolveGuards.list()) guards.push(guardToPromiseFn(guard, to, from));
			guards.push(canceledNavigationCheck);
			return runGuardQueue(guards);
		}).catch((err) => isNavigationFailure(err, 8) ? err : Promise.reject(err));
	}
	function triggerAfterEach(to, from, failure) {
		afterGuards.list().forEach((guard) => runWithContext(() => guard(to, from, failure)));
	}
	/**
	* - Cleans up any navigation guards
	* - Changes the url if necessary
	* - Calls the scrollBehavior
	*/
	function finalizeNavigation(toLocation, from, isPush, replace, data) {
		const error = checkCanceledNavigation(toLocation, from);
		if (error) return error;
		const isFirstNavigation = from === START_LOCATION_NORMALIZED;
		const state = !isBrowser ? {} : history.state;
		if (isPush) {
			if (replace || isFirstNavigation) routerHistory.replace(toLocation.fullPath, assign({ scroll: isFirstNavigation && state && state.scroll }, data));
			else routerHistory.push(toLocation.fullPath, data);
		}
		currentRoute.value = toLocation;
		handleScroll(toLocation, from, isPush, isFirstNavigation);
		markAsReady();
	}
	let removeHistoryListener;
	function setupListeners() {
		if (removeHistoryListener) return;
		removeHistoryListener = routerHistory.listen((to, _from, info) => {
			if (!router.listening) return;
			const toLocation = resolve(to);
			const shouldRedirect = handleRedirectRecord(toLocation, router.currentRoute.value);
			if (shouldRedirect) {
				pushWithRedirect(assign(shouldRedirect, {
					replace: true,
					force: true
				}), toLocation).catch(noop);
				return;
			}
			pendingLocation = toLocation;
			const from = currentRoute.value;
			if (isBrowser && info.delta) saveScrollPosition(getScrollKey(from.fullPath, info.delta));
			navigate(toLocation, from).catch((error) => {
				if (isNavigationFailure(error, 12)) return error;
				if (isNavigationFailure(error, 2)) {
					pushWithRedirect(assign(locationAsObject(error.to), { force: true }), toLocation).then((failure) => {
						if (isNavigationFailure(failure, 20) && !info.delta && info.type === "pop") routerHistory.go(-1, false);
					}).catch(noop);
					return Promise.reject();
				}
				if (info.delta) routerHistory.go(-info.delta, false);
				return triggerError(error, toLocation, from);
			}).then((failure) => {
				failure = failure || finalizeNavigation(toLocation, from, false);
				if (failure) {
					if (info.delta && !isNavigationFailure(failure, 8)) routerHistory.go(-info.delta, false);
					else if (info.type === "pop" && isNavigationFailure(failure, 20)) routerHistory.go(-1, false);
				}
				triggerAfterEach(toLocation, from, failure);
			}).catch(noop);
		});
	}
	let readyHandlers = useCallbacks();
	let errorListeners = useCallbacks();
	let ready;
	/**
	* Trigger errorListeners added via onError and throws the error as well
	*
	* @param error - error to throw
	* @param to - location we were navigating to when the error happened
	* @param from - location we were navigating from when the error happened
	* @returns the error as a rejected promise
	*/
	function triggerError(error, to, from) {
		markAsReady(error);
		const list = errorListeners.list();
		if (list.length) list.forEach((handler) => handler(error, to, from));
		else console.error(error);
		return Promise.reject(error);
	}
	function isReady() {
		if (ready && currentRoute.value !== START_LOCATION_NORMALIZED) return Promise.resolve();
		return new Promise((resolve, reject) => {
			readyHandlers.add([resolve, reject]);
		});
	}
	function markAsReady(err) {
		if (!ready) {
			ready = !err;
			setupListeners();
			readyHandlers.list().forEach(([resolve, reject]) => err ? reject(err) : resolve());
			readyHandlers.reset();
		}
		return err;
	}
	function handleScroll(to, from, isPush, isFirstNavigation) {
		const { scrollBehavior } = options;
		if (!isBrowser || !scrollBehavior) return Promise.resolve();
		const scrollPosition = !isPush && getSavedScrollPosition(getScrollKey(to.fullPath, 0)) || (isFirstNavigation || !isPush) && history.state && history.state.scroll || null;
		return nextTick().then(() => scrollBehavior(to, from, scrollPosition)).then((position) => to === currentRoute.value && position && scrollToPosition(position)).catch((err) => to === currentRoute.value && triggerError(err, to, from));
	}
	const go = (delta) => routerHistory.go(delta);
	let started;
	const installedApps = /* @__PURE__ */ new Set();
	const router = {
		currentRoute,
		listening: true,
		addRoute,
		removeRoute,
		clearRoutes,
		hasRoute,
		getRoutes,
		resolve,
		options,
		push,
		replace,
		go,
		back: () => go(-1),
		forward: () => go(1),
		beforeEach: beforeGuards.add,
		beforeResolve: beforeResolveGuards.add,
		afterEach: afterGuards.add,
		onError: errorListeners.add,
		isReady,
		install(app) {
			app.component("RouterLink", RouterLink);
			app.component("RouterView", RouterView);
			app.config.globalProperties.$router = router;
			Object.defineProperty(app.config.globalProperties, "$route", {
				enumerable: true,
				get: () => unref(currentRoute)
			});
			if (isBrowser && !started && currentRoute.value === START_LOCATION_NORMALIZED) {
				started = true;
				push(routerHistory.location).catch((err) => {});
			}
			const reactiveRoute = {};
			for (const key in START_LOCATION_NORMALIZED) Object.defineProperty(reactiveRoute, key, {
				get: () => currentRoute.value[key],
				enumerable: true
			});
			app.provide(routerKey, router);
			app.provide(routeLocationKey, /* @__PURE__ */ shallowReactive(reactiveRoute));
			app.provide(routerViewLocationKey, currentRoute);
			const unmountApp = app.unmount;
			installedApps.add(app);
			app.unmount = function() {
				installedApps.delete(app);
				if (installedApps.size < 1) {
					pendingLocation = START_LOCATION_NORMALIZED;
					removeHistoryListener && removeHistoryListener();
					removeHistoryListener = null;
					currentRoute.value = START_LOCATION_NORMALIZED;
					started = false;
					ready = false;
				}
				unmountApp();
			};
		}
	};
	function runGuardQueue(guards) {
		return guards.reduce((promise, guard) => promise.then(() => runWithContext(guard)), Promise.resolve());
	}
	return router;
}
// src/renderer/src/stores/appStore.ts
var useAppStore = defineStore("app", () => {
	const currentUser = /* @__PURE__ */ ref(null);
	const subscriptionDaysRemaining = /* @__PURE__ */ ref(null);
	const isDark = /* @__PURE__ */ ref(localStorage.getItem("sallehli_theme") === "dark");
	const appVersion = /* @__PURE__ */ ref("v1.0.0");
	const settings = /* @__PURE__ */ ref({
		center_name: "مركز صلحلي للصيانة المعتمدة",
		center_subtitle: "صيانة جميع الأجهزة المنزلية والكهربائية",
		phone1: "01012345678",
		phone2: "01112345678",
		whatsapp: "201012345678",
		address: "القاهرة - شارع التحرير الرئيسي",
		logo_base64: "",
		default_print_format: "a4",
		default_inspection_fee: 150,
		default_warranty_months: 6,
		warranty_terms: "",
		receipt_footer: ""
	});
	const printModalOpen = /* @__PURE__ */ ref(false);
	const ticketToPrint = /* @__PURE__ */ ref(null);
	const activePrintFormat = /* @__PURE__ */ ref("a4");
	const activePrintDocType = /* @__PURE__ */ ref("invoice_warranty");
	const isAuthenticated = computed(() => !!currentUser.value);
	const isSuperAdmin = computed(() => currentUser.value?.role === "super_admin");
	const isOwner = computed(() => currentUser.value?.role === "owner");
	const isTenant = computed(() => currentUser.value?.role === "tenant");
	function applyTheme() {
		if (isDark.value) {
			document.documentElement.classList.add("dark");
			localStorage.setItem("sallehli_theme", "dark");
		} else {
			document.documentElement.classList.remove("dark");
			localStorage.setItem("sallehli_theme", "light");
		}
	}
	function toggleTheme() {
		isDark.value = !isDark.value;
		applyTheme();
	}
	async function loadSettings() {
		try {
			const data = await window.api.getSettings();
			settings.value = data;
			activePrintFormat.value = data.default_print_format || "a4";
			if (window.api.getAppVersion) {
				const ver = await window.api.getAppVersion();
				if (ver) appVersion.value = ver.startsWith("v") ? ver : `v${ver}`;
			}
		} catch (e) {
			console.error("Failed to load settings", e);
		}
	}
	function setSession(user, daysRemaining) {
		currentUser.value = user;
		subscriptionDaysRemaining.value = daysRemaining;
	}
	function logout() {
		currentUser.value = null;
		subscriptionDaysRemaining.value = null;
	}
	function openPrintModal(ticket, docType = "invoice_warranty", format) {
		ticketToPrint.value = ticket;
		activePrintDocType.value = docType;
		activePrintFormat.value = format || settings.value.default_print_format || "a4";
		printModalOpen.value = true;
	}
	function closePrintModal() {
		printModalOpen.value = false;
		ticketToPrint.value = null;
	}
	function sendWhatsAppToCustomer(ticket) {
		let rawPhone = (ticket.customer_phone || "").replace(/\D/g, "");
		if (rawPhone.startsWith("01") && rawPhone.length === 11) rawPhone = "2" + rawPhone;
		const warrantyLine = ticket.warranty_months > 0 && ticket.warranty_end_date ? `\n🛡️ الضمان: ${ticket.warranty_months} شهور (ساري حتى ${ticket.warranty_end_date})` : "";
		const message = `مرحباً بك أ/ ${ticket.customer_name} من *${settings.value.center_name}* 🔧\n📋 رقم طلب الصيانة: *${ticket.ticket_number}*\n🔌 الجهاز: ${ticket.appliance_type} (${ticket.brand})\n📌 الإجمالي: ${ticket.total_amount} ج.م | المدفوع: ${ticket.paid_amount} ج.م | المتبقي: ${ticket.remaining_amount} ج.م` + warrantyLine + `\n📞 للاستفسار: ${settings.value.phone1}`;
		const url = `https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`;
		window.api.openExternal(url);
	}
	return {
		currentUser,
		subscriptionDaysRemaining,
		isDark,
		appVersion,
		settings,
		printModalOpen,
		ticketToPrint,
		activePrintFormat,
		activePrintDocType,
		isAuthenticated,
		isSuperAdmin,
		isOwner,
		isTenant,
		applyTheme,
		toggleTheme,
		loadSettings,
		setSession,
		logout,
		openPrintModal,
		closePrintModal,
		sendWhatsAppToCustomer
	};
});
// src/renderer/src/constants/appliances.ts
var APPLIANCE_TYPES = [
	"غسالة أوتوماتيك",
	"غسالة فوق أوتوماتيك",
	"غسالة هاف أوتوماتيك",
	"مجفف ملابس (دراير)",
	"غسالة أطباق",
	"ثلاجة نوفروست",
	"ثلاجة ديفروست",
	"ثلاجة دوبلكس / انفرتر",
	"ديب فريزر رأسي (أدراج)",
	"ديب فريزر أفقي (صندوق)",
	"تكييف سبليت",
	"تكييف شباك / كونسيلد",
	"بوتاجاز غاز / بلت إن",
	"سخان غاز",
	"سخان كهرباء",
	"ميكروويف / فرن كهربائي",
	"مبرد مياه (كولديير)",
	"جهاز كهربائي آخر"
];
var APPLIANCE_BRANDS = [
	"LG (إل جي)",
	"Samsung (سامسونج)",
	"Toshiba (توشيبا)",
	"Sharp (شارب)",
	"Fresh (فريش)",
	"Kiriazi (كريازي)",
	"Zanussi (زانوسي)",
	"Beko (بيكو)",
	"Tornado (تورنيدو)",
	"Unionaire (يونيون إير)",
	"Carrier (كاريير)",
	"Ariston (أريستون)",
	"Indesit (إنديست)",
	"White Point (وايت بوينت)",
	"White Whale (وايت ويل)",
	"Hoover (هوفر)",
	"Olympic (أوليمبيك)",
	"Universal (يونيفرسال)",
	"Electrostar (إلكتروستار)",
	"Passap (باساب)",
	"أخرى"
];
var PART_CATEGORIES = [
	"غسالات",
	"ثلاجات وديب فريزر",
	"تكييفات",
	"بوتاجازات وسخانات",
	"كروت إلكترونية وحساسات",
	"مواتير وكباسات",
	"فريون وخامات تبريد",
	"عام"
];
var TICKET_STATUS_MAP = {
	new: {
		label: "بلاغ جديد",
		badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800"
	},
	assigned: {
		label: "تم تعيين فني",
		badgeClass: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
	},
	inspecting: {
		label: "تحت الفحص والكشف",
		badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800"
	},
	waiting_parts: {
		label: "بانتظار قطعة غيار / موافقة",
		badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800"
	},
	repaired: {
		label: "تم الإصلاح (جاهز للتسليم)",
		badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
	},
	delivered: {
		label: "تم التسليم والتحصيل",
		badgeClass: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border-teal-200 dark:border-teal-800"
	},
	cancelled: {
		label: "ملغي / مرتجع بدون إصلاح",
		badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-800"
	}
};
var PAYMENT_METHODS = {
	cash: "نقدي (كاش)",
	vodafone_cash: "محفظة إلكترونية (فودافون كاش)",
	instapay: "إنستا باي (InstaPay)",
	bank: "تحويل بنكي / فيزا"
};
var USER_ROLE_LABELS = {
	super_admin: {
		label: "سوبر أدمن (مالك البرنامج بالكامل)",
		desc: "تحكم كامل بالنظام والتراخيص والمستخدمين",
		badge: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
	},
	owner: {
		label: "مالك البرنامج (ترخيص دائم)",
		desc: "صلاحية دائمة لإدارة مركز الصيانة بالكامل",
		badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
	},
	tenant: {
		label: "مستأجر البرنامج (اشتراك محدد بمدة)",
		desc: "صلاحية إدارة المركز خلال فترة الإيجار المحددة",
		badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
	}
};
// node_modules/lucide-vue-next/dist/esm/shared/src/utils/hasA11yProp.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var hasA11yProp = (props) => {
	for (const prop in props) if (prop.startsWith("aria-") || prop === "role" || prop === "title") return true;
	return false;
};
// node_modules/lucide-vue-next/dist/esm/shared/src/utils/isEmptyString.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var isEmptyString = (value) => value === "";
// node_modules/lucide-vue-next/dist/esm/shared/src/utils/mergeClasses.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
	return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();
// node_modules/lucide-vue-next/dist/esm/shared/src/utils/toKebabCase.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
// node_modules/lucide-vue-next/dist/esm/shared/src/utils/toCamelCase.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var toCamelCase = (string) => string.replace(/^([A-Z])|[\s-_]+(\w)/g, (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase());
// node_modules/lucide-vue-next/dist/esm/shared/src/utils/toPascalCase.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var toPascalCase = (string) => {
	const camelCase = toCamelCase(string);
	return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};
// node_modules/lucide-vue-next/dist/esm/defaultAttributes.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var defaultAttributes = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": 2,
	"stroke-linecap": "round",
	"stroke-linejoin": "round"
};
// node_modules/lucide-vue-next/dist/esm/Icon.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Icon = ({ name, iconNode, absoluteStrokeWidth, "absolute-stroke-width": absoluteStrokeWidthKebabCase, strokeWidth, "stroke-width": strokeWidthKebabCase, size = defaultAttributes.width, color = defaultAttributes.stroke, ...props }, { slots }) => {
	return h("svg", {
		...defaultAttributes,
		...props,
		width: size,
		height: size,
		stroke: color,
		"stroke-width": isEmptyString(absoluteStrokeWidth) || isEmptyString(absoluteStrokeWidthKebabCase) || absoluteStrokeWidth === true || absoluteStrokeWidthKebabCase === true ? Number(strokeWidth || strokeWidthKebabCase || defaultAttributes["stroke-width"]) * 24 / Number(size) : strokeWidth || strokeWidthKebabCase || defaultAttributes["stroke-width"],
		class: mergeClasses("lucide", props.class, ...name ? [`lucide-${toKebabCase(toPascalCase(name))}-icon`, `lucide-${toKebabCase(name)}`] : ["lucide-icon"]),
		...!slots.default && !hasA11yProp(props) && { "aria-hidden": "true" }
	}, [...iconNode.map((child) => h(...child)), ...slots.default ? [slots.default()] : []]);
};
// node_modules/lucide-vue-next/dist/esm/createLucideIcon.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var createLucideIcon = (iconName, iconNode) => (props, { slots, attrs }) => h(Icon, {
	...attrs,
	...props,
	iconNode,
	name: iconName
}, slots);
// node_modules/lucide-vue-next/dist/esm/icons/arrow-down-left.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var ArrowDownLeft = createLucideIcon("arrow-down-left", [["path", {
	d: "M17 7 7 17",
	key: "15tmo1"
}], ["path", {
	d: "M17 17H7V7",
	key: "1org7z"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/arrow-up-right.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var ArrowUpRight = createLucideIcon("arrow-up-right", [["path", {
	d: "M7 7h10v10",
	key: "1tivn9"
}], ["path", {
	d: "M7 17 17 7",
	key: "1vkiza"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/building-2.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Building2 = createLucideIcon("building-2", [
	["path", {
		d: "M10 12h4",
		key: "a56b0p"
	}],
	["path", {
		d: "M10 8h4",
		key: "1sr2af"
	}],
	["path", {
		d: "M14 21v-3a2 2 0 0 0-4 0v3",
		key: "1rgiei"
	}],
	["path", {
		d: "M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2",
		key: "secmi2"
	}],
	["path", {
		d: "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16",
		key: "16ra0t"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/calendar-clock.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var CalendarClock = createLucideIcon("calendar-clock", [
	["path", {
		d: "M16 14v2.2l1.6 1",
		key: "fo4ql5"
	}],
	["path", {
		d: "M16 2v4",
		key: "4m81vk"
	}],
	["path", {
		d: "M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5",
		key: "1osxxc"
	}],
	["path", {
		d: "M3 10h5",
		key: "r794hk"
	}],
	["path", {
		d: "M8 2v4",
		key: "1cmpym"
	}],
	["circle", {
		cx: "16",
		cy: "16",
		r: "6",
		key: "qoo3c4"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/circle-arrow-down.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var CircleArrowDown = createLucideIcon("circle-arrow-down", [
	["circle", {
		cx: "12",
		cy: "12",
		r: "10",
		key: "1mglay"
	}],
	["path", {
		d: "M12 8v8",
		key: "napkw2"
	}],
	["path", {
		d: "m8 12 4 4 4-4",
		key: "k98ssh"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/circle-arrow-up.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var CircleArrowUp = createLucideIcon("circle-arrow-up", [
	["circle", {
		cx: "12",
		cy: "12",
		r: "10",
		key: "1mglay"
	}],
	["path", {
		d: "m16 12-4-4-4 4",
		key: "177agl"
	}],
	["path", {
		d: "M12 16V8",
		key: "1sbj14"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/circle-check-big.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var CircleCheckBig = createLucideIcon("circle-check-big", [["path", {
	d: "M21.801 10A10 10 0 1 1 17 3.335",
	key: "yps3ct"
}], ["path", {
	d: "m9 11 3 3L22 4",
	key: "1pflzl"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/circle-check.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var CircleCheck = createLucideIcon("circle-check", [["circle", {
	cx: "12",
	cy: "12",
	r: "10",
	key: "1mglay"
}], ["path", {
	d: "m9 12 2 2 4-4",
	key: "dzmm74"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/circle-plus.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var CirclePlus = createLucideIcon("circle-plus", [
	["circle", {
		cx: "12",
		cy: "12",
		r: "10",
		key: "1mglay"
	}],
	["path", {
		d: "M8 12h8",
		key: "1wcyev"
	}],
	["path", {
		d: "M12 8v8",
		key: "napkw2"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/circle-x.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var CircleX = createLucideIcon("circle-x", [
	["circle", {
		cx: "12",
		cy: "12",
		r: "10",
		key: "1mglay"
	}],
	["path", {
		d: "m15 9-6 6",
		key: "1uzhvr"
	}],
	["path", {
		d: "m9 9 6 6",
		key: "z0biqf"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/database-backup.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var DatabaseBackup = createLucideIcon("database-backup", [
	["ellipse", {
		cx: "12",
		cy: "5",
		rx: "9",
		ry: "3",
		key: "msslwz"
	}],
	["path", {
		d: "M3 12a9 3 0 0 0 5 2.69",
		key: "1ui2ym"
	}],
	["path", {
		d: "M21 9.3V5",
		key: "6k6cib"
	}],
	["path", {
		d: "M3 5v14a9 3 0 0 0 6.47 2.88",
		key: "i62tjy"
	}],
	["path", {
		d: "M12 12v4h4",
		key: "1bxaet"
	}],
	["path", {
		d: "M13 20a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L12 16",
		key: "1f4ei9"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/file-text.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var FileText = createLucideIcon("file-text", [
	["path", {
		d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
		key: "1oefj6"
	}],
	["path", {
		d: "M14 2v5a1 1 0 0 0 1 1h5",
		key: "wfsgrz"
	}],
	["path", {
		d: "M10 9H8",
		key: "b1mrlr"
	}],
	["path", {
		d: "M16 13H8",
		key: "t4e002"
	}],
	["path", {
		d: "M16 17H8",
		key: "z1uh3a"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/history.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var History = createLucideIcon("history", [
	["path", {
		d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
		key: "1357e3"
	}],
	["path", {
		d: "M3 3v5h5",
		key: "1xhq8a"
	}],
	["path", {
		d: "M12 7v5l4 2",
		key: "1fdv2h"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/house.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var House = createLucideIcon("house", [["path", {
	d: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
	key: "5wwlr5"
}], ["path", {
	d: "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
	key: "r6nss1"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/image.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Image = createLucideIcon("image", [
	["rect", {
		width: "18",
		height: "18",
		x: "3",
		y: "3",
		rx: "2",
		ry: "2",
		key: "1m3agn"
	}],
	["circle", {
		cx: "9",
		cy: "9",
		r: "2",
		key: "af1f0g"
	}],
	["path", {
		d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21",
		key: "1xmnt7"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/key-round.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var KeyRound = createLucideIcon("key-round", [["path", {
	d: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",
	key: "1s6t7t"
}], ["circle", {
	cx: "16.5",
	cy: "7.5",
	r: ".5",
	fill: "currentColor",
	key: "w0ekpg"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/layout-dashboard.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var LayoutDashboard = createLucideIcon("layout-dashboard", [
	["rect", {
		width: "7",
		height: "9",
		x: "3",
		y: "3",
		rx: "1",
		key: "10lvy0"
	}],
	["rect", {
		width: "7",
		height: "5",
		x: "14",
		y: "3",
		rx: "1",
		key: "16une8"
	}],
	["rect", {
		width: "7",
		height: "9",
		x: "14",
		y: "12",
		rx: "1",
		key: "1hutg5"
	}],
	["rect", {
		width: "7",
		height: "5",
		x: "3",
		y: "16",
		rx: "1",
		key: "ldoo1y"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/lock.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Lock = createLucideIcon("lock", [["rect", {
	width: "18",
	height: "11",
	x: "3",
	y: "11",
	rx: "2",
	ry: "2",
	key: "1w4ew1"
}], ["path", {
	d: "M7 11V7a5 5 0 0 1 10 0v4",
	key: "fwvmzm"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/log-out.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var LogOut = createLucideIcon("log-out", [
	["path", {
		d: "m16 17 5-5-5-5",
		key: "1bji2h"
	}],
	["path", {
		d: "M21 12H9",
		key: "dn1m92"
	}],
	["path", {
		d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
		key: "1uf3rs"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/message-circle.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var MessageCircle = createLucideIcon("message-circle", [["path", {
	d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
	key: "1sd12s"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/moon.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Moon = createLucideIcon("moon", [["path", {
	d: "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",
	key: "kfwtm"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/package-plus.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var PackagePlus = createLucideIcon("package-plus", [
	["path", {
		d: "M12 22V12",
		key: "d0xqtd"
	}],
	["path", {
		d: "M16 17h6",
		key: "1ook5g"
	}],
	["path", {
		d: "M19 14v6",
		key: "1ckrd5"
	}],
	["path", {
		d: "M21 10.535V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.675-.955",
		key: "28k6lz"
	}],
	["path", {
		d: "M3.29 7 12 12l8.71-5",
		key: "19ckod"
	}],
	["path", {
		d: "m7.5 4.27 8.997 5.148",
		key: "9yrvtv"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/package.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Package = createLucideIcon("package", [
	["path", {
		d: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
		key: "1a0edw"
	}],
	["path", {
		d: "M12 22V12",
		key: "d0xqtd"
	}],
	["polyline", {
		points: "3.29 7 12 12 20.71 7",
		key: "ousv84"
	}],
	["path", {
		d: "m7.5 4.27 9 5.15",
		key: "1c824w"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/pen-line.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var PenLine = createLucideIcon("pen-line", [["path", {
	d: "M13 21h8",
	key: "1jsn5i"
}], ["path", {
	d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
	key: "1a8usu"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/printer.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Printer = createLucideIcon("printer", [
	["path", {
		d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",
		key: "143wyd"
	}],
	["path", {
		d: "M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
		key: "1itne7"
	}],
	["rect", {
		x: "6",
		y: "14",
		width: "12",
		height: "8",
		rx: "1",
		key: "1ue0tg"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/receipt.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Receipt = createLucideIcon("receipt", [
	["path", {
		d: "M12 17V7",
		key: "pyj7ub"
	}],
	["path", {
		d: "M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8",
		key: "1elt7d"
	}],
	["path", {
		d: "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
		key: "ycz6yz"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/save.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Save = createLucideIcon("save", [
	["path", {
		d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
		key: "1c8476"
	}],
	["path", {
		d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7",
		key: "1ydtos"
	}],
	["path", {
		d: "M7 3v4a1 1 0 0 0 1 1h7",
		key: "t51u73"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/search.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Search = createLucideIcon("search", [["path", {
	d: "m21 21-4.34-4.34",
	key: "14j7rj"
}], ["circle", {
	cx: "11",
	cy: "11",
	r: "8",
	key: "4ej97u"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/settings.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Settings = createLucideIcon("settings", [["path", {
	d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
	key: "1i5ecw"
}], ["circle", {
	cx: "12",
	cy: "12",
	r: "3",
	key: "1v7zrd"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/shield-alert.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var ShieldAlert = createLucideIcon("shield-alert", [
	["path", {
		d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
		key: "oel41y"
	}],
	["path", {
		d: "M12 8v4",
		key: "1got3b"
	}],
	["path", {
		d: "M12 16h.01",
		key: "1drbdi"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/shield-check.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var ShieldCheck = createLucideIcon("shield-check", [["path", {
	d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
	key: "oel41y"
}], ["path", {
	d: "m9 12 2 2 4-4",
	key: "dzmm74"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/sun.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Sun = createLucideIcon("sun", [
	["circle", {
		cx: "12",
		cy: "12",
		r: "4",
		key: "4exip2"
	}],
	["path", {
		d: "M12 2v2",
		key: "tus03m"
	}],
	["path", {
		d: "M12 20v2",
		key: "1lh1kg"
	}],
	["path", {
		d: "m4.93 4.93 1.41 1.41",
		key: "149t6j"
	}],
	["path", {
		d: "m17.66 17.66 1.41 1.41",
		key: "ptbguv"
	}],
	["path", {
		d: "M2 12h2",
		key: "1t8f8n"
	}],
	["path", {
		d: "M20 12h2",
		key: "1q8mjw"
	}],
	["path", {
		d: "m6.34 17.66-1.41 1.41",
		key: "1m8zz5"
	}],
	["path", {
		d: "m19.07 4.93-1.41 1.41",
		key: "1shlcs"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/trash-2.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Trash2 = createLucideIcon("trash-2", [
	["path", {
		d: "M10 11v6",
		key: "nco0om"
	}],
	["path", {
		d: "M14 11v6",
		key: "outv1u"
	}],
	["path", {
		d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
		key: "miytrc"
	}],
	["path", {
		d: "M3 6h18",
		key: "d0wm0j"
	}],
	["path", {
		d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
		key: "e791ji"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/trending-up.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var TrendingUp = createLucideIcon("trending-up", [["path", {
	d: "M16 7h6v6",
	key: "box55l"
}], ["path", {
	d: "m22 7-8.5 8.5-5-5L2 17",
	key: "1t1m79"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/triangle-alert.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var TriangleAlert = createLucideIcon("triangle-alert", [
	["path", {
		d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
		key: "wmoenq"
	}],
	["path", {
		d: "M12 9v4",
		key: "juzpu7"
	}],
	["path", {
		d: "M12 17h.01",
		key: "p32p05"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/upload.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Upload = createLucideIcon("upload", [
	["path", {
		d: "M12 3v12",
		key: "1x0j5s"
	}],
	["path", {
		d: "m17 8-5-5-5 5",
		key: "7q97r8"
	}],
	["path", {
		d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
		key: "ih7n3h"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/user-cog.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var UserCog = createLucideIcon("user-cog", [
	["path", {
		d: "M10 15H6a4 4 0 0 0-4 4v2",
		key: "1nfge6"
	}],
	["path", {
		d: "m14.305 16.53.923-.382",
		key: "1itpsq"
	}],
	["path", {
		d: "m15.228 13.852-.923-.383",
		key: "eplpkm"
	}],
	["path", {
		d: "m16.852 12.228-.383-.923",
		key: "13v3q0"
	}],
	["path", {
		d: "m16.852 17.772-.383.924",
		key: "1i8mnm"
	}],
	["path", {
		d: "m19.148 12.228.383-.923",
		key: "1q8j1v"
	}],
	["path", {
		d: "m19.53 18.696-.382-.924",
		key: "vk1qj3"
	}],
	["path", {
		d: "m20.772 13.852.924-.383",
		key: "n880s0"
	}],
	["path", {
		d: "m20.772 16.148.924.383",
		key: "1g6xey"
	}],
	["circle", {
		cx: "18",
		cy: "15",
		r: "3",
		key: "gjjjvw"
	}],
	["circle", {
		cx: "9",
		cy: "7",
		r: "4",
		key: "nufk8"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/user-plus.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var UserPlus = createLucideIcon("user-plus", [
	["path", {
		d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
		key: "1yyitq"
	}],
	["circle", {
		cx: "9",
		cy: "7",
		r: "4",
		key: "nufk8"
	}],
	["line", {
		x1: "19",
		x2: "19",
		y1: "8",
		y2: "14",
		key: "1bvyxn"
	}],
	["line", {
		x1: "22",
		x2: "16",
		y1: "11",
		y2: "11",
		key: "1shjgl"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/user.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var User = createLucideIcon("user", [["path", {
	d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",
	key: "975kel"
}], ["circle", {
	cx: "12",
	cy: "7",
	r: "4",
	key: "17ys0d"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/users.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Users = createLucideIcon("users", [
	["path", {
		d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
		key: "1yyitq"
	}],
	["path", {
		d: "M16 3.128a4 4 0 0 1 0 7.744",
		key: "16gr8j"
	}],
	["path", {
		d: "M22 21v-2a4 4 0 0 0-3-3.87",
		key: "kshegd"
	}],
	["circle", {
		cx: "9",
		cy: "7",
		r: "4",
		key: "nufk8"
	}]
]);
// node_modules/lucide-vue-next/dist/esm/icons/wallet.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Wallet = createLucideIcon("wallet", [["path", {
	d: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
	key: "18etb6"
}], ["path", {
	d: "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
	key: "xoc0q4"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/wrench.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Wrench = createLucideIcon("wrench", [["path", {
	d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z",
	key: "1ngwbx"
}]]);
// node_modules/lucide-vue-next/dist/esm/icons/x.js
/**
* @license lucide-vue-next v1.0.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var X = createLucideIcon("x", [["path", {
	d: "M18 6 6 18",
	key: "1bl5f8"
}], ["path", {
	d: "m6 6 12 12",
	key: "d8bk6v"
}]]);
// src/renderer/src/components/PrintModal.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$10 = {
	key: 0,
	class: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 overflow-y-auto"
};
var _hoisted_2$10 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden" };
var _hoisted_3$10 = { class: "no-print flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700" };
var _hoisted_4$10 = { class: "flex items-center gap-2" };
var _hoisted_5$10 = { class: "font-bold text-lg text-slate-900 dark:text-white" };
var _hoisted_6$10 = { class: "flex flex-wrap items-center gap-3" };
var _hoisted_7$10 = { class: "flex rounded-xl bg-slate-200 dark:bg-slate-900 p-1 text-xs font-semibold" };
var _hoisted_8$10 = { class: "flex rounded-xl bg-slate-200 dark:bg-slate-900 p-1 text-xs font-semibold" };
var _hoisted_9$10 = { class: "flex-1 overflow-y-auto p-6 bg-slate-200/70 dark:bg-slate-950 flex justify-center" };
var _hoisted_10$10 = {
	key: 0,
	id: "printable-area",
	dir: "rtl",
	class: "bg-white text-slate-900 w-full max-w-[210mm] p-8 rounded-xl shadow-lg border border-slate-300 text-sm"
};
var _hoisted_11$10 = { class: "flex items-start justify-between border-b-2 border-slate-800 pb-4 mb-5" };
var _hoisted_12$10 = { class: "space-y-1" };
var _hoisted_13$10 = { class: "flex items-center gap-3" };
var _hoisted_14$10 = ["src"];
var _hoisted_15$10 = { class: "text-2xl font-black text-slate-900" };
var _hoisted_16$10 = { class: "text-xs text-slate-600 font-semibold max-w-md" };
var _hoisted_17$10 = { class: "text-xs text-slate-700 pt-1" };
var _hoisted_18$9 = { class: "text-xs text-slate-700 font-bold" };
var _hoisted_19$9 = { key: 0 };
var _hoisted_20$9 = { class: "text-left bg-slate-100 border border-slate-300 rounded-xl p-3 min-w-[200px]" };
var _hoisted_21$9 = { class: "text-xs font-bold text-slate-500 uppercase" };
var _hoisted_22$8 = { class: "text-lg font-black text-slate-900 mt-0.5" };
var _hoisted_23$8 = { class: "text-xs text-slate-600 mt-1" };
var _hoisted_24$8 = { class: "text-xs font-bold text-slate-800 mt-0.5" };
var _hoisted_25$8 = { class: "grid grid-cols-2 gap-4 mb-5" };
var _hoisted_26$8 = { class: "border border-slate-300 rounded-xl p-3.5 bg-slate-50/60" };
var _hoisted_27$7 = { class: "space-y-1 text-xs" };
var _hoisted_28$7 = { key: 0 };
var _hoisted_29$7 = { class: "border border-slate-300 rounded-xl p-3.5 bg-slate-50/60" };
var _hoisted_30$7 = { class: "space-y-1 text-xs" };
var _hoisted_31$7 = { class: "border border-slate-300 rounded-xl p-3.5 mb-5 space-y-2 text-xs" };
var _hoisted_32$7 = { class: "text-slate-700" };
var _hoisted_33$7 = {
	key: 0,
	class: "pt-1 border-t border-slate-200"
};
var _hoisted_34$7 = { class: "text-slate-700" };
var _hoisted_35$7 = {
	key: 0,
	class: "mb-5 border border-slate-300 rounded-xl overflow-hidden"
};
var _hoisted_36$6 = { class: "w-full text-right text-xs border-collapse" };
var _hoisted_37$6 = { class: "divide-y divide-slate-200" };
var _hoisted_38$5 = { class: "py-2 px-3 font-semibold" };
var _hoisted_39$5 = { class: "py-2 px-3 font-mono" };
var _hoisted_40$5 = { class: "py-2 px-3 font-bold" };
var _hoisted_41$5 = { class: "py-2 px-3" };
var _hoisted_42$5 = { class: "py-2 px-3" };
var _hoisted_43$5 = { class: "py-2 px-3 font-bold" };
var _hoisted_44$5 = { class: "grid grid-cols-2 gap-4 mb-5" };
var _hoisted_45$5 = { class: "border-2 border-slate-800 rounded-xl p-4 bg-slate-50 flex flex-col justify-between" };
var _hoisted_46$5 = { class: "flex items-center justify-between border-b border-slate-300 pb-2 mb-2" };
var _hoisted_47$5 = { class: "px-2.5 py-0.5 rounded-full text-xs font-bold border border-slate-800" };
var _hoisted_48$5 = {
	key: 0,
	class: "grid grid-cols-2 gap-2 text-xs font-bold text-slate-800 mb-2"
};
var _hoisted_49$5 = { class: "text-[11px] text-slate-600 whitespace-pre-line leading-relaxed" };
var _hoisted_50$3 = { class: "border border-slate-300 rounded-xl p-4 space-y-1.5 text-xs" };
var _hoisted_51$2 = { class: "flex justify-between" };
var _hoisted_52$2 = { class: "font-bold" };
var _hoisted_53$2 = { class: "flex justify-between" };
var _hoisted_54$2 = { class: "font-bold" };
var _hoisted_55$2 = { class: "flex justify-between" };
var _hoisted_56$2 = { class: "font-bold" };
var _hoisted_57$2 = {
	key: 0,
	class: "flex justify-between text-emerald-700"
};
var _hoisted_58$2 = { class: "font-bold" };
var _hoisted_59$2 = { class: "flex justify-between border-t-2 border-slate-800 pt-2 text-sm font-black text-slate-900" };
var _hoisted_60$2 = { class: "flex justify-between text-slate-700 pt-1" };
var _hoisted_61$1 = { class: "font-bold" };
var _hoisted_62$1 = { class: "flex justify-between font-black text-slate-900" };
var _hoisted_63$1 = { class: "mt-4 pt-2 border-t border-dashed border-slate-300 text-center text-xs font-bold text-slate-600" };
var _hoisted_64$1 = {
	key: 1,
	id: "printable-area",
	dir: "rtl",
	class: "bg-white text-black w-[80mm] p-3.5 rounded-lg shadow-lg border border-slate-300 text-xs font-sans"
};
var _hoisted_65$1 = { class: "text-center border-b border-dashed border-black pb-2 mb-2" };
var _hoisted_66$1 = ["src"];
var _hoisted_67$1 = { class: "font-black text-sm" };
var _hoisted_68$1 = { class: "text-[10px] text-slate-700" };
var _hoisted_69$1 = { class: "text-[11px] font-bold mt-0.5" };
var _hoisted_70$1 = { key: 0 };
var _hoisted_71$1 = { class: "text-center bg-slate-100 border border-black rounded py-1 mb-2" };
var _hoisted_72$1 = { class: "text-[10px] font-bold" };
var _hoisted_73$1 = { class: "font-black text-sm" };
var _hoisted_74$1 = { class: "text-[10px]" };
var _hoisted_75$1 = { class: "space-y-1 border-b border-dashed border-black pb-2 mb-2 text-[11px]" };
var _hoisted_76$1 = { key: 0 };
var _hoisted_77$1 = { key: 1 };
var _hoisted_78$1 = { class: "space-y-1 border-b border-dashed border-black pb-2 mb-2 text-[11px]" };
var _hoisted_79$1 = { key: 0 };
var _hoisted_80$1 = {
	key: 0,
	class: "border-b border-dashed border-black pb-2 mb-2"
};
var _hoisted_81$1 = { class: "font-bold" };
var _hoisted_82$1 = { class: "space-y-1 border-b border-dashed border-black pb-2 mb-2 text-[11px]" };
var _hoisted_83$1 = { class: "flex justify-between" };
var _hoisted_84$1 = { class: "flex justify-between" };
var _hoisted_85$1 = {
	key: 0,
	class: "flex justify-between"
};
var _hoisted_86$1 = {
	key: 1,
	class: "flex justify-between"
};
var _hoisted_87$1 = { class: "flex justify-between font-black text-xs border-t border-black pt-1" };
var _hoisted_88$1 = { class: "flex justify-between" };
var _hoisted_89$1 = { class: "font-bold" };
var _hoisted_90$1 = { class: "flex justify-between font-black" };
var _hoisted_91$1 = {
	key: 1,
	class: "border border-black rounded p-1.5 text-center mb-2 text-[10px]"
};
var _hoisted_92$1 = { class: "font-black" };
var _hoisted_93$1 = { key: 0 };
var _hoisted_94$1 = { class: "text-center text-[10px] font-bold pt-1" };
// src/renderer/src/components/PrintModal.vue
var PrintModal_default = /* @__PURE__ */ defineComponent({
	__name: "PrintModal",
	setup(__props) {
		const appStore = useAppStore();
		const ticket = computed(() => appStore.ticketToPrint);
		const settings = computed(() => appStore.settings);
		function triggerPrint() {
			window.print();
		}
		return (_ctx, _cache) => {
			return unref(appStore).printModalOpen && ticket.value ? (openBlock(), createElementBlock("div", _hoisted_1$10, [createBaseVNode("div", _hoisted_2$10, [createBaseVNode("div", _hoisted_3$10, [createBaseVNode("div", _hoisted_4$10, [createVNode(unref(Printer), { class: "w-5 h-5 text-blue-600 dark:text-blue-400" }), createBaseVNode("h3", _hoisted_5$10, " معاينة الطباعة - طلب رقم " + toDisplayString(ticket.value.ticket_number), 1)]), createBaseVNode("div", _hoisted_6$10, [
				createBaseVNode("div", _hoisted_7$10, [createBaseVNode("button", {
					type: "button",
					onClick: _cache[0] || (_cache[0] = ($event) => unref(appStore).activePrintDocType = "invoice_warranty"),
					class: normalizeClass(["flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer", unref(appStore).activePrintDocType === "invoice_warranty" ? "bg-blue-600 text-white shadow-xs" : "text-slate-700 dark:text-slate-300 hover:text-slate-900"])
				}, [createVNode(unref(ShieldCheck), { class: "w-4 h-4" }), _cache[5] || (_cache[5] = createTextVNode(" فاتورة صيانة + شهادة ضمان ", -1))], 2), createBaseVNode("button", {
					type: "button",
					onClick: _cache[1] || (_cache[1] = ($event) => unref(appStore).activePrintDocType = "reception_receipt"),
					class: normalizeClass(["flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer", unref(appStore).activePrintDocType === "reception_receipt" ? "bg-blue-600 text-white shadow-xs" : "text-slate-700 dark:text-slate-300 hover:text-slate-900"])
				}, [createVNode(unref(Wrench), { class: "w-4 h-4" }), _cache[6] || (_cache[6] = createTextVNode(" إيصال استلام / أمر شغل ", -1))], 2)]),
				createBaseVNode("div", _hoisted_8$10, [createBaseVNode("button", {
					type: "button",
					onClick: _cache[2] || (_cache[2] = ($event) => unref(appStore).activePrintFormat = "a4"),
					class: normalizeClass(["flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer", unref(appStore).activePrintFormat === "a4" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-700 dark:text-slate-300 hover:text-slate-900"])
				}, [createVNode(unref(FileText), { class: "w-4 h-4" }), _cache[7] || (_cache[7] = createTextVNode(" قالب A4 / A5 الرسمي ", -1))], 2), createBaseVNode("button", {
					type: "button",
					onClick: _cache[3] || (_cache[3] = ($event) => unref(appStore).activePrintFormat = "thermal80"),
					class: normalizeClass(["flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer", unref(appStore).activePrintFormat === "thermal80" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-700 dark:text-slate-300 hover:text-slate-900"])
				}, [createVNode(unref(Receipt), { class: "w-4 h-4" }), _cache[8] || (_cache[8] = createTextVNode(" قالب حراري 80mm ", -1))], 2)]),
				createBaseVNode("button", {
					type: "button",
					onClick: triggerPrint,
					class: "flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition cursor-pointer"
				}, [createVNode(unref(Printer), { class: "w-4 h-4" }), _cache[9] || (_cache[9] = createTextVNode(" طباعة الآن ", -1))]),
				createBaseVNode("button", {
					type: "button",
					onClick: _cache[4] || (_cache[4] = (...args) => unref(appStore).closePrintModal && unref(appStore).closePrintModal(...args)),
					class: "p-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 text-slate-700 dark:text-slate-200 transition cursor-pointer"
				}, [createVNode(unref(X), { class: "w-5 h-5" })])
			])]), createBaseVNode("div", _hoisted_9$10, [unref(appStore).activePrintFormat === "a4" ? (openBlock(), createElementBlock("div", _hoisted_10$10, [
				createBaseVNode("div", _hoisted_11$10, [createBaseVNode("div", _hoisted_12$10, [
					createBaseVNode("div", _hoisted_13$10, [settings.value.logo_base64 ? (openBlock(), createElementBlock("img", {
						key: 0,
						src: settings.value.logo_base64,
						alt: "Logo",
						class: "w-14 h-14 object-contain rounded-lg border border-slate-200"
					}, null, 8, _hoisted_14$10)) : createCommentVNode("", true), createBaseVNode("div", null, [createBaseVNode("h1", _hoisted_15$10, toDisplayString(settings.value.center_name), 1), createBaseVNode("p", _hoisted_16$10, toDisplayString(settings.value.center_subtitle), 1)])]),
					createBaseVNode("p", _hoisted_17$10, "📍 " + toDisplayString(settings.value.address), 1),
					createBaseVNode("p", _hoisted_18$9, [createTextVNode(" 📞 خدمة العملاء: " + toDisplayString(settings.value.phone1) + " ", 1), settings.value.phone2 ? (openBlock(), createElementBlock("span", _hoisted_19$9, " - " + toDisplayString(settings.value.phone2), 1)) : createCommentVNode("", true)])
				]), createBaseVNode("div", _hoisted_20$9, [
					createBaseVNode("div", _hoisted_21$9, toDisplayString(unref(appStore).activePrintDocType === "invoice_warranty" ? "فاتورة صيانة وشهادة ضمان" : "إيصال استلام / أمر شغل صيانة"), 1),
					createBaseVNode("div", _hoisted_22$8, toDisplayString(ticket.value.ticket_number), 1),
					createBaseVNode("div", _hoisted_23$8, " التاريخ: " + toDisplayString(ticket.value.created_at?.slice(0, 10) || ticket.value.scheduled_date), 1),
					createBaseVNode("div", _hoisted_24$8, " نوع الخدمة: " + toDisplayString(ticket.value.service_type === "home_visit" ? "زيارة منزلية" : "صيانة بالورشة"), 1)
				])]),
				createBaseVNode("div", _hoisted_25$8, [createBaseVNode("div", _hoisted_26$8, [_cache[14] || (_cache[14] = createBaseVNode("h4", { class: "font-bold text-slate-900 border-b border-slate-200 pb-1.5 mb-2 text-xs" }, " 👤 بيانات العميل ", -1)), createBaseVNode("div", _hoisted_27$7, [
					createBaseVNode("div", null, [_cache[10] || (_cache[10] = createBaseVNode("span", { class: "font-bold" }, "الاسم:", -1)), createTextVNode(" " + toDisplayString(ticket.value.customer_name), 1)]),
					createBaseVNode("div", null, [
						_cache[11] || (_cache[11] = createBaseVNode("span", { class: "font-bold" }, "الهاتف:", -1)),
						createTextVNode(" " + toDisplayString(ticket.value.customer_phone) + " ", 1),
						ticket.value.customer_phone2 ? (openBlock(), createElementBlock("span", _hoisted_28$7, " / " + toDisplayString(ticket.value.customer_phone2), 1)) : createCommentVNode("", true)
					]),
					createBaseVNode("div", null, [_cache[12] || (_cache[12] = createBaseVNode("span", { class: "font-bold" }, "المنطقة:", -1)), createTextVNode(" " + toDisplayString(ticket.value.customer_area || "—"), 1)]),
					createBaseVNode("div", null, [_cache[13] || (_cache[13] = createBaseVNode("span", { class: "font-bold" }, "العنوان:", -1)), createTextVNode(" " + toDisplayString(ticket.value.customer_address || "—"), 1)])
				])]), createBaseVNode("div", _hoisted_29$7, [_cache[20] || (_cache[20] = createBaseVNode("h4", { class: "font-bold text-slate-900 border-b border-slate-200 pb-1.5 mb-2 text-xs" }, " 🔌 بيانات الجهاز الكهربائي ", -1)), createBaseVNode("div", _hoisted_30$7, [
					createBaseVNode("div", null, [_cache[15] || (_cache[15] = createBaseVNode("span", { class: "font-bold" }, "نوع الجهاز:", -1)), createTextVNode(" " + toDisplayString(ticket.value.appliance_type), 1)]),
					createBaseVNode("div", null, [_cache[16] || (_cache[16] = createBaseVNode("span", { class: "font-bold" }, "الماركة:", -1)), createTextVNode(" " + toDisplayString(ticket.value.brand), 1)]),
					createBaseVNode("div", null, [_cache[17] || (_cache[17] = createBaseVNode("span", { class: "font-bold" }, "الموديل:", -1)), createTextVNode(" " + toDisplayString(ticket.value.model || "—"), 1)]),
					createBaseVNode("div", null, [_cache[18] || (_cache[18] = createBaseVNode("span", { class: "font-bold" }, "السيريال (S/N):", -1)), createTextVNode(" " + toDisplayString(ticket.value.serial_number || "—"), 1)]),
					createBaseVNode("div", null, [_cache[19] || (_cache[19] = createBaseVNode("span", { class: "font-bold" }, "الفني المسؤول:", -1)), createTextVNode(" " + toDisplayString(ticket.value.technician_name || "لم يحدد"), 1)])
				])])]),
				createBaseVNode("div", _hoisted_31$7, [createBaseVNode("div", null, [_cache[21] || (_cache[21] = createBaseVNode("span", { class: "font-bold text-slate-900" }, "شكوى العميل / العطل المبلّغ عنه: ", -1)), createBaseVNode("span", _hoisted_32$7, toDisplayString(ticket.value.complaint), 1)]), ticket.value.diagnosis ? (openBlock(), createElementBlock("div", _hoisted_33$7, [_cache[22] || (_cache[22] = createBaseVNode("span", { class: "font-bold text-slate-900" }, "التقرير الفني والإجراء المتخذ: ", -1)), createBaseVNode("span", _hoisted_34$7, toDisplayString(ticket.value.diagnosis), 1)])) : createCommentVNode("", true)]),
				ticket.value.parts && ticket.value.parts.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_35$7, [createBaseVNode("table", _hoisted_36$6, [_cache[23] || (_cache[23] = createBaseVNode("thead", { class: "bg-slate-800 text-white" }, [createBaseVNode("tr", null, [
					createBaseVNode("th", { class: "py-2 px-3" }, "#"),
					createBaseVNode("th", { class: "py-2 px-3" }, "كود القطعة"),
					createBaseVNode("th", { class: "py-2 px-3" }, "بيان قطعة الغيار المستبدلة"),
					createBaseVNode("th", { class: "py-2 px-3" }, "الكمية"),
					createBaseVNode("th", { class: "py-2 px-3" }, "سعر الوحدة"),
					createBaseVNode("th", { class: "py-2 px-3" }, "الإجمالي")
				])], -1)), createBaseVNode("tbody", _hoisted_37$6, [(openBlock(true), createElementBlock(Fragment, null, renderList(ticket.value.parts, (item, idx) => {
					return openBlock(), createElementBlock("tr", { key: idx }, [
						createBaseVNode("td", _hoisted_38$5, toDisplayString(idx + 1), 1),
						createBaseVNode("td", _hoisted_39$5, toDisplayString(item.part_code), 1),
						createBaseVNode("td", _hoisted_40$5, toDisplayString(item.part_name), 1),
						createBaseVNode("td", _hoisted_41$5, toDisplayString(item.quantity), 1),
						createBaseVNode("td", _hoisted_42$5, toDisplayString(item.unit_price) + " ج.م", 1),
						createBaseVNode("td", _hoisted_43$5, toDisplayString(item.total_price) + " ج.م", 1)
					]);
				}), 128))])])])) : createCommentVNode("", true),
				createBaseVNode("div", _hoisted_44$5, [createBaseVNode("div", _hoisted_45$5, [createBaseVNode("div", null, [
					createBaseVNode("div", _hoisted_46$5, [_cache[24] || (_cache[24] = createBaseVNode("h4", { class: "font-black text-sm text-slate-900" }, "🛡️ شهادة الضمان المعتمدة", -1)), createBaseVNode("span", _hoisted_47$5, toDisplayString(ticket.value.warranty_months > 0 ? `ضمان ${ticket.value.warranty_months} شهور` : "بدون ضمان"), 1)]),
					ticket.value.warranty_months > 0 ? (openBlock(), createElementBlock("div", _hoisted_48$5, [createBaseVNode("div", null, "بداية الضمان: " + toDisplayString(ticket.value.warranty_start_date || "تاريخ التسليم"), 1), createBaseVNode("div", null, "نهاية الضمان: " + toDisplayString(ticket.value.warranty_end_date || "—"), 1)])) : createCommentVNode("", true),
					createBaseVNode("p", _hoisted_49$5, toDisplayString(settings.value.warranty_terms), 1)
				])]), createBaseVNode("div", _hoisted_50$3, [
					createBaseVNode("div", _hoisted_51$2, [_cache[25] || (_cache[25] = createBaseVNode("span", { class: "text-slate-600" }, "رسوم الكشف والزيارة:", -1)), createBaseVNode("span", _hoisted_52$2, toDisplayString(ticket.value.inspection_fee) + " ج.م", 1)]),
					createBaseVNode("div", _hoisted_53$2, [_cache[26] || (_cache[26] = createBaseVNode("span", { class: "text-slate-600" }, "تكلفة المصنعية والإصلاح:", -1)), createBaseVNode("span", _hoisted_54$2, toDisplayString(ticket.value.labor_cost) + " ج.م", 1)]),
					createBaseVNode("div", _hoisted_55$2, [_cache[27] || (_cache[27] = createBaseVNode("span", { class: "text-slate-600" }, "إجمالي قطع الغيار:", -1)), createBaseVNode("span", _hoisted_56$2, toDisplayString(ticket.value.parts_total) + " ج.م", 1)]),
					ticket.value.discount > 0 ? (openBlock(), createElementBlock("div", _hoisted_57$2, [_cache[28] || (_cache[28] = createBaseVNode("span", null, "خصم خاص:", -1)), createBaseVNode("span", _hoisted_58$2, "- " + toDisplayString(ticket.value.discount) + " ج.م", 1)])) : createCommentVNode("", true),
					createBaseVNode("div", _hoisted_59$2, [_cache[29] || (_cache[29] = createBaseVNode("span", null, "الإجمالي النهائي:", -1)), createBaseVNode("span", null, toDisplayString(ticket.value.total_amount) + " ج.م", 1)]),
					createBaseVNode("div", _hoisted_60$2, [createBaseVNode("span", null, "المبلغ المدفوع (" + toDisplayString(unref(PAYMENT_METHODS)[ticket.value.payment_method] || "كاش") + "):", 1), createBaseVNode("span", _hoisted_61$1, toDisplayString(ticket.value.paid_amount) + " ج.م", 1)]),
					createBaseVNode("div", _hoisted_62$1, [_cache[30] || (_cache[30] = createBaseVNode("span", null, "المبلغ المتبقي:", -1)), createBaseVNode("span", null, toDisplayString(ticket.value.remaining_amount) + " ج.م", 1)])
				])]),
				_cache[31] || (_cache[31] = createStaticVNode("<div class=\"grid grid-cols-3 gap-4 pt-4 border-t border-slate-300 text-center text-xs\"><div><p class=\"font-bold text-slate-700 mb-6\">توقيع الفني المسؤول</p><p class=\"text-slate-400\">....................................</p></div><div><p class=\"font-bold text-slate-700 mb-6\">ختم المركز المعتمد</p><p class=\"text-slate-400\">....................................</p></div><div><p class=\"font-bold text-slate-700 mb-6\">توقيع العميل بالاستلام</p><p class=\"text-slate-400\">....................................</p></div></div>", 1)),
				createBaseVNode("div", _hoisted_63$1, toDisplayString(settings.value.receipt_footer), 1)
			])) : (openBlock(), createElementBlock("div", _hoisted_64$1, [
				createBaseVNode("div", _hoisted_65$1, [
					settings.value.logo_base64 ? (openBlock(), createElementBlock("img", {
						key: 0,
						src: settings.value.logo_base64,
						alt: "Logo",
						class: "w-12 h-12 mx-auto mb-1 object-contain"
					}, null, 8, _hoisted_66$1)) : createCommentVNode("", true),
					createBaseVNode("div", _hoisted_67$1, toDisplayString(settings.value.center_name), 1),
					createBaseVNode("div", _hoisted_68$1, toDisplayString(settings.value.address), 1),
					createBaseVNode("div", _hoisted_69$1, [createTextVNode(" ت: " + toDisplayString(settings.value.phone1) + " ", 1), settings.value.phone2 ? (openBlock(), createElementBlock("span", _hoisted_70$1, "/ " + toDisplayString(settings.value.phone2), 1)) : createCommentVNode("", true)])
				]),
				createBaseVNode("div", _hoisted_71$1, [
					createBaseVNode("div", _hoisted_72$1, toDisplayString(unref(appStore).activePrintDocType === "invoice_warranty" ? "فاتورة صيانة وشهادة ضمان" : "إيصال استلام / أمر شغل"), 1),
					createBaseVNode("div", _hoisted_73$1, toDisplayString(ticket.value.ticket_number), 1),
					createBaseVNode("div", _hoisted_74$1, toDisplayString(ticket.value.created_at?.slice(0, 16) || ticket.value.scheduled_date), 1)
				]),
				createBaseVNode("div", _hoisted_75$1, [
					createBaseVNode("div", null, [_cache[32] || (_cache[32] = createBaseVNode("span", { class: "font-bold" }, "العميل:", -1)), createTextVNode(" " + toDisplayString(ticket.value.customer_name), 1)]),
					createBaseVNode("div", null, [_cache[33] || (_cache[33] = createBaseVNode("span", { class: "font-bold" }, "الموبايل:", -1)), createTextVNode(" " + toDisplayString(ticket.value.customer_phone), 1)]),
					ticket.value.customer_area ? (openBlock(), createElementBlock("div", _hoisted_76$1, [_cache[34] || (_cache[34] = createBaseVNode("span", { class: "font-bold" }, "المنطقة:", -1)), createTextVNode(" " + toDisplayString(ticket.value.customer_area) + " - " + toDisplayString(ticket.value.customer_address), 1)])) : createCommentVNode("", true),
					createBaseVNode("div", null, [_cache[35] || (_cache[35] = createBaseVNode("span", { class: "font-bold" }, "الجهاز:", -1)), createTextVNode(" " + toDisplayString(ticket.value.appliance_type) + " (" + toDisplayString(ticket.value.brand) + ") ", 1)]),
					ticket.value.model ? (openBlock(), createElementBlock("div", _hoisted_77$1, [_cache[36] || (_cache[36] = createBaseVNode("span", { class: "font-bold" }, "الموديل:", -1)), createTextVNode(" " + toDisplayString(ticket.value.model), 1)])) : createCommentVNode("", true),
					createBaseVNode("div", null, [_cache[37] || (_cache[37] = createBaseVNode("span", { class: "font-bold" }, "الخدمة:", -1)), createTextVNode(" " + toDisplayString(ticket.value.service_type === "home_visit" ? "زيارة منزلية" : "ورشة المركز"), 1)]),
					createBaseVNode("div", null, [_cache[38] || (_cache[38] = createBaseVNode("span", { class: "font-bold" }, "الحالة:", -1)), createTextVNode(" " + toDisplayString(unref(TICKET_STATUS_MAP)[ticket.value.status]?.label || ticket.value.status), 1)]),
					createBaseVNode("div", null, [_cache[39] || (_cache[39] = createBaseVNode("span", { class: "font-bold" }, "الفني:", -1)), createTextVNode(" " + toDisplayString(ticket.value.technician_name || "—"), 1)])
				]),
				createBaseVNode("div", _hoisted_78$1, [createBaseVNode("div", null, [_cache[40] || (_cache[40] = createBaseVNode("span", { class: "font-bold" }, "الشكوى:", -1)), createTextVNode(" " + toDisplayString(ticket.value.complaint), 1)]), ticket.value.diagnosis ? (openBlock(), createElementBlock("div", _hoisted_79$1, [_cache[41] || (_cache[41] = createBaseVNode("span", { class: "font-bold" }, "الإصلاح:", -1)), createTextVNode(" " + toDisplayString(ticket.value.diagnosis), 1)])) : createCommentVNode("", true)]),
				ticket.value.parts && ticket.value.parts.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_80$1, [_cache[42] || (_cache[42] = createBaseVNode("div", { class: "font-bold text-[11px] mb-1" }, "قطع الغيار:", -1)), (openBlock(true), createElementBlock(Fragment, null, renderList(ticket.value.parts, (p, idx) => {
					return openBlock(), createElementBlock("div", {
						key: idx,
						class: "flex justify-between text-[10px] py-0.5"
					}, [createBaseVNode("span", null, toDisplayString(p.part_name) + " (×" + toDisplayString(p.quantity) + ")", 1), createBaseVNode("span", _hoisted_81$1, toDisplayString(p.total_price) + " ج.م", 1)]);
				}), 128))])) : createCommentVNode("", true),
				createBaseVNode("div", _hoisted_82$1, [
					createBaseVNode("div", _hoisted_83$1, [_cache[43] || (_cache[43] = createBaseVNode("span", null, "رسوم الكشف:", -1)), createBaseVNode("span", null, toDisplayString(ticket.value.inspection_fee) + " ج.م", 1)]),
					createBaseVNode("div", _hoisted_84$1, [_cache[44] || (_cache[44] = createBaseVNode("span", null, "المصنعية:", -1)), createBaseVNode("span", null, toDisplayString(ticket.value.labor_cost) + " ج.م", 1)]),
					ticket.value.parts_total > 0 ? (openBlock(), createElementBlock("div", _hoisted_85$1, [_cache[45] || (_cache[45] = createBaseVNode("span", null, "قطع الغيار:", -1)), createBaseVNode("span", null, toDisplayString(ticket.value.parts_total) + " ج.م", 1)])) : createCommentVNode("", true),
					ticket.value.discount > 0 ? (openBlock(), createElementBlock("div", _hoisted_86$1, [_cache[46] || (_cache[46] = createBaseVNode("span", null, "الخصم:", -1)), createBaseVNode("span", null, "- " + toDisplayString(ticket.value.discount) + " ج.م", 1)])) : createCommentVNode("", true),
					createBaseVNode("div", _hoisted_87$1, [_cache[47] || (_cache[47] = createBaseVNode("span", null, "الإجمالي:", -1)), createBaseVNode("span", null, toDisplayString(ticket.value.total_amount) + " ج.م", 1)]),
					createBaseVNode("div", _hoisted_88$1, [_cache[48] || (_cache[48] = createBaseVNode("span", null, "المدفوع:", -1)), createBaseVNode("span", _hoisted_89$1, toDisplayString(ticket.value.paid_amount) + " ج.م", 1)]),
					createBaseVNode("div", _hoisted_90$1, [_cache[49] || (_cache[49] = createBaseVNode("span", null, "المتبقي:", -1)), createBaseVNode("span", null, toDisplayString(ticket.value.remaining_amount) + " ج.م", 1)])
				]),
				ticket.value.warranty_months > 0 ? (openBlock(), createElementBlock("div", _hoisted_91$1, [createBaseVNode("div", _hoisted_92$1, "🛡️ ضمان معتمد لمدة " + toDisplayString(ticket.value.warranty_months) + " شهور", 1), ticket.value.warranty_end_date ? (openBlock(), createElementBlock("div", _hoisted_93$1, "ساري حتى: " + toDisplayString(ticket.value.warranty_end_date), 1)) : createCommentVNode("", true)])) : createCommentVNode("", true),
				createBaseVNode("div", _hoisted_94$1, toDisplayString(settings.value.receipt_footer), 1)
			]))])])])) : createCommentVNode("", true);
		};
	}
});
// src/renderer/src/assets/joker-tech-logo.png
var joker_tech_logo_default = new URL("joker-tech-logo-CKS7L_hl.png", import.meta.url).href;
// src/renderer/src/App.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$9 = {
	dir: "rtl",
	class: "min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
};
var _hoisted_2$9 = {
	key: 1,
	class: "flex h-screen overflow-hidden"
};
var _hoisted_3$9 = { class: "no-print w-68 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0" };
var _hoisted_4$9 = { class: "p-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-gradient-to-l from-blue-600/10 to-transparent" };
var _hoisted_5$9 = { class: "w-11 h-11 rounded-2xl bg-white dark:bg-slate-100 border border-blue-200 dark:border-slate-700 flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0 p-1.5" };
var _hoisted_6$9 = ["src"];
var _hoisted_7$9 = { class: "overflow-hidden" };
var _hoisted_8$9 = { class: "flex items-center gap-1.5" };
var _hoisted_9$9 = { class: "px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono text-[10px] font-bold shrink-0" };
var _hoisted_10$9 = { class: "p-3 space-y-1.5" };
var _hoisted_11$9 = { class: "p-4 border-t border-slate-200 dark:border-slate-800 space-y-3" };
var _hoisted_12$9 = { class: "p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 space-y-1" };
var _hoisted_13$9 = { class: "font-black text-xs text-slate-900 dark:text-white truncate" };
var _hoisted_14$9 = { class: "flex items-center justify-between" };
var _hoisted_15$9 = { class: "text-[11px] font-mono text-slate-400" };
var _hoisted_16$9 = { class: "flex items-center gap-2" };
var _hoisted_17$9 = { class: "pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500" };
var _hoisted_18$8 = { class: "flex items-center gap-1.5" };
var _hoisted_19$8 = ["src"];
var _hoisted_20$8 = { class: "font-mono font-bold" };
var _hoisted_21$8 = { class: "flex-1 overflow-y-auto p-6" };
// src/renderer/src/App.vue
var App_default = /* @__PURE__ */ defineComponent({
	__name: "App",
	setup(__props) {
		const router = useRouter();
		const route = useRoute();
		const appStore = useAppStore();
		const navItems = computed(() => {
			const items = [
				{
					name: "dashboard",
					path: "/dashboard",
					label: "لوحة التحكم اليومية",
					icon: LayoutDashboard
				},
				{
					name: "tickets",
					path: "/tickets",
					label: "بلاغات وطلبات الصيانة",
					icon: Wrench
				},
				{
					name: "customers",
					path: "/customers",
					label: "العملاء وسجل الأجهزة",
					icon: Users
				},
				{
					name: "technicians",
					path: "/technicians",
					label: "الفنيين والعمولات",
					icon: UserCog
				},
				{
					name: "inventory",
					path: "/inventory",
					label: "المخزن وقطع الغيار",
					icon: Package
				},
				{
					name: "treasury",
					path: "/treasury",
					label: "الخزينة والحسابات",
					icon: Wallet
				},
				{
					name: "settings",
					path: "/settings",
					label: "إعدادات المركز والطباعة",
					icon: Settings
				}
			];
			if (appStore.isSuperAdmin) items.push({
				name: "super-admin",
				path: "/super-admin",
				label: "لوحة السوبر أدمن والتراخيص",
				icon: ShieldCheck
			});
			return items;
		});
		function handleLogout() {
			appStore.logout();
			router.push("/login");
		}
		onMounted(() => {
			appStore.applyTheme();
		});
		return (_ctx, _cache) => {
			const _component_router_view = resolveComponent("router-view");
			const _component_router_link = resolveComponent("router-link");
			return openBlock(), createElementBlock("div", _hoisted_1$9, [!unref(appStore).isAuthenticated || unref(route).name === "login" ? (openBlock(), createBlock(_component_router_view, { key: 0 })) : (openBlock(), createElementBlock("div", _hoisted_2$9, [createBaseVNode("aside", _hoisted_3$9, [createBaseVNode("div", null, [createBaseVNode("div", _hoisted_4$9, [createBaseVNode("div", _hoisted_5$9, [createBaseVNode("img", {
				src: unref(joker_tech_logo_default),
				alt: "الجوكر تك",
				class: "w-full h-full object-contain"
			}, null, 8, _hoisted_6$9)]), createBaseVNode("div", _hoisted_7$9, [createBaseVNode("div", _hoisted_8$9, [_cache[1] || (_cache[1] = createBaseVNode("h2", { class: "font-black text-base text-slate-900 dark:text-white truncate" }, " صلحلي ", -1)), createBaseVNode("span", _hoisted_9$9, toDisplayString(unref(appStore).appVersion), 1)]), _cache[2] || (_cache[2] = createBaseVNode("p", { class: "text-[11px] text-slate-500 dark:text-slate-400 truncate" }, " إدارة صيانة الأجهزة الكهربائية ", -1))])]), createBaseVNode("nav", _hoisted_10$9, [(openBlock(true), createElementBlock(Fragment, null, renderList(navItems.value, (item) => {
				return openBlock(), createBlock(_component_router_link, {
					key: item.name,
					to: item.path,
					class: normalizeClass(["flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition", unref(route).path.startsWith(item.path) ? item.name === "super-admin" ? "bg-purple-600 text-white shadow-md shadow-purple-600/25" : "bg-blue-600 text-white shadow-md shadow-blue-600/25" : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"])
				}, {
					default: withCtx(() => [(openBlock(), createBlock(resolveDynamicComponent(item.icon), { class: "w-4 h-4 shrink-0" })), createBaseVNode("span", null, toDisplayString(item.label), 1)]),
					_: 2
				}, 1032, ["to", "class"]);
			}), 128))])]), createBaseVNode("div", _hoisted_11$9, [
				createBaseVNode("div", _hoisted_12$9, [createBaseVNode("div", _hoisted_13$9, toDisplayString(unref(appStore).currentUser?.full_name), 1), createBaseVNode("div", _hoisted_14$9, [createBaseVNode("span", { class: normalizeClass(["inline-block px-2 py-0.5 rounded-full text-[10px] font-bold", unref(USER_ROLE_LABELS)[unref(appStore).currentUser?.role || "tenant"]?.badge]) }, toDisplayString(unref(appStore).currentUser?.role === "super_admin" ? "سوبر أدمن" : unref(appStore).currentUser?.role === "owner" ? "مالك البرنامج" : "مستأجر البرنامج"), 3), createBaseVNode("span", _hoisted_15$9, " @" + toDisplayString(unref(appStore).currentUser?.username), 1)])]),
				createBaseVNode("div", _hoisted_16$9, [createBaseVNode("button", {
					type: "button",
					onClick: _cache[0] || (_cache[0] = (...args) => unref(appStore).toggleTheme && unref(appStore).toggleTheme(...args)),
					class: "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold transition cursor-pointer"
				}, [unref(appStore).isDark ? (openBlock(), createBlock(unref(Sun), {
					key: 0,
					class: "w-4 h-4 text-amber-400"
				})) : (openBlock(), createBlock(unref(Moon), {
					key: 1,
					class: "w-4 h-4 text-slate-700"
				})), createBaseVNode("span", null, toDisplayString(unref(appStore).isDark ? "فاتح" : "داكن"), 1)]), createBaseVNode("button", {
					type: "button",
					onClick: handleLogout,
					class: "flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 text-xs font-bold transition cursor-pointer",
					title: "تسجيل الخروج"
				}, [createVNode(unref(LogOut), { class: "w-4 h-4" }), _cache[3] || (_cache[3] = createBaseVNode("span", null, "خروج", -1))])]),
				createBaseVNode("div", _hoisted_17$9, [createBaseVNode("div", _hoisted_18$8, [createBaseVNode("img", {
					src: unref(joker_tech_logo_default),
					alt: "الجوكر تك",
					class: "w-4 h-4 object-contain bg-white rounded-xs p-0.5"
				}, null, 8, _hoisted_19$8), _cache[4] || (_cache[4] = createBaseVNode("span", { class: "font-bold text-slate-600 dark:text-slate-400" }, "تطوير: الجوكر تك", -1))]), createBaseVNode("span", _hoisted_20$8, toDisplayString(unref(appStore).appVersion), 1)])
			])]), createBaseVNode("main", _hoisted_21$8, [createVNode(_component_router_view)])])), createVNode(PrintModal_default)]);
		};
	}
});
// src/renderer/src/views/LoginView.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$8 = { class: "min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/40 p-6 relative" };
var _hoisted_2$8 = { class: "w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden" };
var _hoisted_3$8 = { class: "bg-gradient-to-l from-blue-700 via-blue-600 to-indigo-700 p-8 text-white text-center relative" };
var _hoisted_4$8 = { class: "w-20 h-20 rounded-2xl bg-white border-2 border-white/40 flex items-center justify-center mx-auto mb-3 shadow-lg p-2" };
var _hoisted_5$8 = ["src"];
var _hoisted_6$8 = { class: "flex items-center justify-center gap-2" };
var _hoisted_7$8 = { class: "px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-white font-mono text-xs font-bold" };
var _hoisted_8$8 = {
	key: 0,
	class: "flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold"
};
var _hoisted_9$8 = { class: "space-y-1.5" };
var _hoisted_10$8 = { class: "relative" };
var _hoisted_11$8 = { class: "space-y-1.5" };
var _hoisted_12$8 = { class: "relative" };
var _hoisted_13$8 = ["disabled"];
var _hoisted_14$8 = { class: "pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400" };
var _hoisted_15$8 = { class: "flex items-center gap-1.5" };
var _hoisted_16$8 = ["src"];
var _hoisted_17$8 = { class: "font-mono" };
// src/renderer/src/views/LoginView.vue
var LoginView_default = /* @__PURE__ */ defineComponent({
	__name: "LoginView",
	setup(__props) {
		const router = useRouter();
		const appStore = useAppStore();
		const username = /* @__PURE__ */ ref("");
		const password = /* @__PURE__ */ ref("");
		const errorMessage = /* @__PURE__ */ ref("");
		const loading = /* @__PURE__ */ ref(false);
		async function handleLogin() {
			errorMessage.value = "";
			if (!username.value.trim() || !password.value.trim()) {
				errorMessage.value = "يرجى إدخال اسم المستخدم وكلمة المرور";
				return;
			}
			loading.value = true;
			try {
				const res = await window.api.login({
					username: username.value.trim(),
					password: password.value.trim()
				});
				if (!res.success || !res.user) {
					errorMessage.value = res.message || "فشل تسجيل الدخول";
					return;
				}
				appStore.setSession(res.user, res.subscriptionStatus?.daysRemaining ?? null);
				await appStore.loadSettings();
				router.push("/dashboard");
			} catch (err) {
				errorMessage.value = err instanceof Error ? err.message : "حدث خطأ أثناء تسجيل الدخول";
			} finally {
				loading.value = false;
			}
		}
		return (_ctx, _cache) => {
			return openBlock(), createElementBlock("div", _hoisted_1$8, [createBaseVNode("button", {
				type: "button",
				onClick: _cache[0] || (_cache[0] = (...args) => unref(appStore).toggleTheme && unref(appStore).toggleTheme(...args)),
				class: "fixed top-6 left-6 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-sm hover:shadow-md transition cursor-pointer text-xs font-bold"
			}, [unref(appStore).isDark ? (openBlock(), createBlock(unref(Sun), {
				key: 0,
				class: "w-4 h-4 text-amber-400"
			})) : (openBlock(), createBlock(unref(Moon), {
				key: 1,
				class: "w-4 h-4 text-slate-700"
			})), createBaseVNode("span", null, toDisplayString(unref(appStore).isDark ? "الوضع الفاتح" : "الوضع الداكن"), 1)]), createBaseVNode("div", _hoisted_2$8, [createBaseVNode("div", _hoisted_3$8, [
				createBaseVNode("div", _hoisted_4$8, [createBaseVNode("img", {
					src: unref(joker_tech_logo_default),
					alt: "الجوكر تك",
					class: "w-full h-full object-contain"
				}, null, 8, _hoisted_5$8)]),
				createBaseVNode("div", _hoisted_6$8, [_cache[3] || (_cache[3] = createBaseVNode("h1", { class: "text-2xl font-black tracking-tight" }, "صلحلي", -1)), createBaseVNode("span", _hoisted_7$8, toDisplayString(unref(appStore).appVersion), 1)]),
				_cache[4] || (_cache[4] = createBaseVNode("p", { class: "text-blue-100 text-xs font-medium mt-1" }, " النظام المتكامل لإدارة مراكز صيانة الأجهزة الكهربائية والمنزلية ", -1))
			]), createBaseVNode("form", {
				onSubmit: withModifiers(handleLogin, ["prevent"]),
				class: "p-8 space-y-5"
			}, [
				_cache[9] || (_cache[9] = createBaseVNode("div", { class: "text-center mb-2" }, [createBaseVNode("h2", { class: "text-lg font-extrabold text-slate-800 dark:text-slate-100" }, " تسجيل الدخول للنظام "), createBaseVNode("p", { class: "text-xs text-slate-500 dark:text-slate-400 mt-0.5" }, " أدخل بيانات حسابك (سوبر أدمن / مالك البرنامج / مستأجر البرنامج) ")], -1)),
				errorMessage.value ? (openBlock(), createElementBlock("div", _hoisted_8$8, [createVNode(unref(ShieldAlert), { class: "w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" }), createBaseVNode("span", null, toDisplayString(errorMessage.value), 1)])) : createCommentVNode("", true),
				createBaseVNode("div", _hoisted_9$8, [_cache[5] || (_cache[5] = createBaseVNode("label", { class: "block text-xs font-bold text-slate-700 dark:text-slate-300" }, " اسم المستخدم ", -1)), createBaseVNode("div", _hoisted_10$8, [createVNode(unref(User), { class: "w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" }), withDirectives(createBaseVNode("input", {
					"onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => username.value = $event),
					type: "text",
					autofocus: "",
					placeholder: "مثال: admin",
					class: "w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
				}, null, 512), [[vModelText, username.value]])])]),
				createBaseVNode("div", _hoisted_11$8, [_cache[6] || (_cache[6] = createBaseVNode("label", { class: "block text-xs font-bold text-slate-700 dark:text-slate-300" }, " كلمة المرور ", -1)), createBaseVNode("div", _hoisted_12$8, [createVNode(unref(Lock), { class: "w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" }), withDirectives(createBaseVNode("input", {
					"onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => password.value = $event),
					type: "password",
					placeholder: "••••••••",
					class: "w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
				}, null, 512), [[vModelText, password.value]])])]),
				createBaseVNode("button", {
					type: "submit",
					disabled: loading.value,
					class: "w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm shadow-lg shadow-blue-600/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
				}, [createVNode(unref(CircleCheck), { class: "w-4 h-4" }), createBaseVNode("span", null, toDisplayString(loading.value ? "جاري التحقق من الصلاحية..." : "دخول إلى لوحة الإدارة"), 1)], 8, _hoisted_13$8),
				createBaseVNode("div", _hoisted_14$8, [createBaseVNode("div", _hoisted_15$8, [createBaseVNode("img", {
					src: unref(joker_tech_logo_default),
					alt: "الجوكر تك",
					class: "w-4 h-4 object-contain"
				}, null, 8, _hoisted_16$8), _cache[7] || (_cache[7] = createBaseVNode("span", null, [createTextVNode("تطوير: "), createBaseVNode("strong", { class: "text-slate-700 dark:text-slate-200" }, "شركة الجوكر تك")], -1))]), createBaseVNode("span", null, [_cache[8] || (_cache[8] = createTextVNode("الإصدار ", -1)), createBaseVNode("strong", _hoisted_17$8, toDisplayString(unref(appStore).appVersion), 1)])])
			], 32)])]);
		};
	}
});
// src/renderer/src/views/DashboardView.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$7 = { class: "space-y-6" };
var _hoisted_2$7 = { class: "flex items-center gap-2" };
var _hoisted_3$7 = { class: "flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs" };
var _hoisted_4$7 = { class: "text-xl font-black text-slate-900 dark:text-white" };
var _hoisted_5$7 = { class: "flex flex-wrap items-center gap-2.5" };
var _hoisted_6$7 = { class: "grid grid-cols-2 md:grid-cols-4 gap-4" };
var _hoisted_7$7 = { class: "p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between" };
var _hoisted_8$7 = { class: "text-2xl font-black text-slate-900 dark:text-white mt-1" };
var _hoisted_9$7 = { class: "text-[11px] text-blue-600 dark:text-blue-400 font-semibold mt-1" };
var _hoisted_10$7 = { class: "w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center" };
var _hoisted_11$7 = { class: "p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between" };
var _hoisted_12$7 = { class: "text-2xl font-black text-slate-900 dark:text-white mt-1" };
var _hoisted_13$7 = { class: "text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-1" };
var _hoisted_14$7 = { class: "w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center" };
var _hoisted_15$7 = { class: "p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between" };
var _hoisted_16$7 = { class: "text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1" };
var _hoisted_17$7 = { class: "text-[11px] text-slate-500 font-semibold mt-1" };
var _hoisted_18$7 = { class: "w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center" };
var _hoisted_19$7 = { class: "p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between" };
var _hoisted_20$7 = { class: "text-2xl font-black text-teal-600 dark:text-teal-400 mt-1" };
var _hoisted_21$7 = { class: "w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center" };
var _hoisted_22$7 = { class: "grid grid-cols-1 lg:grid-cols-3 gap-6" };
var _hoisted_23$7 = { class: "lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden" };
var _hoisted_24$7 = { class: "px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between" };
var _hoisted_25$7 = { class: "font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2" };
var _hoisted_26$7 = { class: "overflow-x-auto" };
var _hoisted_27$6 = { class: "w-full text-right text-xs" };
var _hoisted_28$6 = { class: "divide-y divide-slate-200 dark:divide-slate-800" };
var _hoisted_29$6 = { class: "py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400" };
var _hoisted_30$6 = { class: "py-3 px-4" };
var _hoisted_31$6 = { class: "font-bold text-slate-900 dark:text-white" };
var _hoisted_32$6 = { class: "text-[11px] text-slate-500" };
var _hoisted_33$6 = { class: "py-3 px-4" };
var _hoisted_34$6 = { class: "font-bold" };
var _hoisted_35$6 = { class: "text-[11px] text-slate-500" };
var _hoisted_36$5 = { class: "py-3 px-4 font-semibold" };
var _hoisted_37$5 = { class: "py-3 px-4" };
var _hoisted_38$4 = { class: "py-3 px-4 font-bold" };
var _hoisted_39$4 = { class: "py-3 px-4" };
var _hoisted_40$4 = { class: "flex items-center gap-1.5" };
var _hoisted_41$4 = ["onClick"];
var _hoisted_42$4 = ["onClick"];
var _hoisted_43$4 = { key: 0 };
var _hoisted_44$4 = { class: "space-y-6" };
var _hoisted_45$4 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3" };
var _hoisted_46$4 = { class: "grid grid-cols-2 gap-3 text-xs" };
var _hoisted_47$4 = { class: "p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900" };
var _hoisted_48$4 = { class: "flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold" };
var _hoisted_49$4 = { class: "text-xl font-black text-emerald-800 dark:text-emerald-300 mt-1" };
var _hoisted_50$2 = { class: "p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900" };
var _hoisted_51$1 = { class: "flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold" };
var _hoisted_52$1 = { class: "text-xl font-black text-amber-800 dark:text-amber-300 mt-1" };
var _hoisted_53$1 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden" };
var _hoisted_54$1 = { class: "px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between" };
var _hoisted_55$1 = { class: "font-extrabold text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2" };
var _hoisted_56$1 = { class: "divide-y divide-slate-200 dark:divide-slate-800 text-xs" };
var _hoisted_57$1 = { class: "font-bold text-slate-900 dark:text-white" };
var _hoisted_58$1 = { class: "text-[11px] text-slate-500" };
var _hoisted_59$1 = { class: "px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-black" };
var _hoisted_60$1 = {
	key: 0,
	class: "py-6 text-center text-slate-400"
};
// src/renderer/src/views/DashboardView.vue
var DashboardView_default = /* @__PURE__ */ defineComponent({
	__name: "DashboardView",
	setup(__props) {
		const router = useRouter();
		const appStore = useAppStore();
		const stats = /* @__PURE__ */ ref({
			totalTicketsToday: 0,
			openTicketsCount: 0,
			homeVisitsCount: 0,
			workshopCount: 0,
			repairedWaitingDeliveryCount: 0,
			activeWarrantyClaimsCount: 0,
			lowStockPartsCount: 0,
			todayIncome: 0,
			todayExpense: 0,
			monthIncome: 0,
			monthExpense: 0,
			monthPartsCost: 0,
			monthTechCommissions: 0,
			monthNetProfit: 0,
			recentTickets: [],
			lowStockParts: []
		});
		async function loadStats() {
			stats.value = await window.api.getDashboardStats();
		}
		onMounted(loadStats);
		return (_ctx, _cache) => {
			return openBlock(), createElementBlock("div", _hoisted_1$7, [
				unref(appStore).isTenant && unref(appStore).subscriptionDaysRemaining !== null ? (openBlock(), createElementBlock("div", {
					key: 0,
					class: normalizeClass(["flex items-center justify-between px-5 py-3 rounded-2xl border text-xs font-bold", unref(appStore).subscriptionDaysRemaining <= 7 ? "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300" : "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300"])
				}, [createBaseVNode("div", _hoisted_2$7, [createVNode(unref(ShieldAlert), { class: "w-4 h-4" }), createBaseVNode("span", null, [
					_cache[5] || (_cache[5] = createTextVNode(" نوع الحساب: مستأجر البرنامج — متبقي في فترة الاشتراك الحالية ", -1)),
					createBaseVNode("strong", null, toDisplayString(unref(appStore).subscriptionDaysRemaining) + " يوم", 1),
					createTextVNode(" (تاريخ الانتهاء: " + toDisplayString(unref(appStore).currentUser?.subscription_end) + ") ", 1)
				])]), _cache[6] || (_cache[6] = createBaseVNode("span", null, "للتجديد تواصل مع السوبر أدمن", -1))], 2)) : createCommentVNode("", true),
				createBaseVNode("div", _hoisted_3$7, [createBaseVNode("div", null, [createBaseVNode("h1", _hoisted_4$7, " لوحة المتابعة اليومية — " + toDisplayString(unref(appStore).settings.center_name), 1), _cache[7] || (_cache[7] = createBaseVNode("p", { class: "text-xs text-slate-500 dark:text-slate-400 mt-0.5" }, " ملخص فوري لحركة الصيانة المنزلية، أجهزة الورشة، قطع الغيار، والخزينة ", -1))]), createBaseVNode("div", _hoisted_5$7, [
					createBaseVNode("button", {
						type: "button",
						onClick: _cache[0] || (_cache[0] = ($event) => unref(router).push("/tickets?new=1")),
						class: "flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer"
					}, [createVNode(unref(CirclePlus), { class: "w-4 h-4" }), _cache[8] || (_cache[8] = createTextVNode(" تسجيل بلاغ صيانة جديد ", -1))]),
					createBaseVNode("button", {
						type: "button",
						onClick: _cache[1] || (_cache[1] = ($event) => unref(router).push("/inventory")),
						class: "flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
					}, [createVNode(unref(Package), { class: "w-4 h-4" }), _cache[9] || (_cache[9] = createTextVNode(" مخزن قطع الغيار ", -1))]),
					createBaseVNode("button", {
						type: "button",
						onClick: _cache[2] || (_cache[2] = ($event) => unref(router).push("/treasury")),
						class: "flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer"
					}, [createVNode(unref(Wallet), { class: "w-4 h-4" }), _cache[10] || (_cache[10] = createTextVNode(" الخزينة والحسابات ", -1))])
				])]),
				createBaseVNode("div", _hoisted_6$7, [
					createBaseVNode("div", _hoisted_7$7, [createBaseVNode("div", null, [
						_cache[11] || (_cache[11] = createBaseVNode("p", { class: "text-xs font-bold text-slate-500 dark:text-slate-400" }, "بلاغات مفتوحة حالياً", -1)),
						createBaseVNode("p", _hoisted_8$7, toDisplayString(stats.value.openTicketsCount), 1),
						createBaseVNode("p", _hoisted_9$7, " منها " + toDisplayString(stats.value.totalTicketsToday) + " بلاغ مسجل اليوم ", 1)
					]), createBaseVNode("div", _hoisted_10$7, [createVNode(unref(Wrench), { class: "w-6 h-6" })])]),
					createBaseVNode("div", _hoisted_11$7, [createBaseVNode("div", null, [
						_cache[12] || (_cache[12] = createBaseVNode("p", { class: "text-xs font-bold text-slate-500 dark:text-slate-400" }, "زيارات منزلية جارية", -1)),
						createBaseVNode("p", _hoisted_12$7, toDisplayString(stats.value.homeVisitsCount), 1),
						createBaseVNode("p", _hoisted_13$7, " + " + toDisplayString(stats.value.workshopCount) + " أجهزة داخل الورشة ", 1)
					]), createBaseVNode("div", _hoisted_14$7, [createVNode(unref(House), { class: "w-6 h-6" })])]),
					createBaseVNode("div", _hoisted_15$7, [createBaseVNode("div", null, [
						_cache[14] || (_cache[14] = createBaseVNode("p", { class: "text-xs font-bold text-slate-500 dark:text-slate-400" }, "إيرادات الخزينة اليوم", -1)),
						createBaseVNode("p", _hoisted_16$7, [createTextVNode(toDisplayString(stats.value.todayIncome) + " ", 1), _cache[13] || (_cache[13] = createBaseVNode("span", { class: "text-xs" }, "ج.م", -1))]),
						createBaseVNode("p", _hoisted_17$7, " مصروفات اليوم: " + toDisplayString(stats.value.todayExpense) + " ج.م ", 1)
					]), createBaseVNode("div", _hoisted_18$7, [createVNode(unref(Wallet), { class: "w-6 h-6" })])]),
					createBaseVNode("div", _hoisted_19$7, [createBaseVNode("div", null, [
						_cache[16] || (_cache[16] = createBaseVNode("p", { class: "text-xs font-bold text-slate-500 dark:text-slate-400" }, "صافي ربح الشهر", -1)),
						createBaseVNode("p", _hoisted_20$7, [createTextVNode(toDisplayString(stats.value.monthNetProfit) + " ", 1), _cache[15] || (_cache[15] = createBaseVNode("span", { class: "text-xs" }, "ج.م", -1))]),
						_cache[17] || (_cache[17] = createBaseVNode("p", { class: "text-[11px] text-slate-500 font-semibold mt-1" }, " بعد خصم تكلفة القطع والعمولات ", -1))
					]), createBaseVNode("div", _hoisted_21$7, [createVNode(unref(TrendingUp), { class: "w-6 h-6" })])])
				]),
				createBaseVNode("div", _hoisted_22$7, [createBaseVNode("div", _hoisted_23$7, [createBaseVNode("div", _hoisted_24$7, [createBaseVNode("h3", _hoisted_25$7, [createVNode(unref(Wrench), { class: "w-4 h-4 text-blue-600" }), _cache[18] || (_cache[18] = createTextVNode(" أحدث بلاغات وطلبات الصيانة ", -1))]), createBaseVNode("button", {
					type: "button",
					onClick: _cache[3] || (_cache[3] = ($event) => unref(router).push("/tickets")),
					class: "text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
				}, " عرض كل الطلبات ← ")]), createBaseVNode("div", _hoisted_26$7, [createBaseVNode("table", _hoisted_27$6, [_cache[20] || (_cache[20] = createBaseVNode("thead", { class: "bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-bold" }, [createBaseVNode("tr", null, [
					createBaseVNode("th", { class: "py-3 px-4" }, "رقم الطلب"),
					createBaseVNode("th", { class: "py-3 px-4" }, "العميل"),
					createBaseVNode("th", { class: "py-3 px-4" }, "الجهاز"),
					createBaseVNode("th", { class: "py-3 px-4" }, "الفني"),
					createBaseVNode("th", { class: "py-3 px-4" }, "الحالة"),
					createBaseVNode("th", { class: "py-3 px-4" }, "الإجمالي"),
					createBaseVNode("th", { class: "py-3 px-4" }, "إجراءات سريعة")
				])], -1)), createBaseVNode("tbody", _hoisted_28$6, [(openBlock(true), createElementBlock(Fragment, null, renderList(stats.value.recentTickets, (t) => {
					return openBlock(), createElementBlock("tr", {
						key: t.id,
						class: "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
					}, [
						createBaseVNode("td", _hoisted_29$6, toDisplayString(t.ticket_number), 1),
						createBaseVNode("td", _hoisted_30$6, [createBaseVNode("div", _hoisted_31$6, toDisplayString(t.customer_name), 1), createBaseVNode("div", _hoisted_32$6, toDisplayString(t.customer_phone), 1)]),
						createBaseVNode("td", _hoisted_33$6, [createBaseVNode("div", _hoisted_34$6, toDisplayString(t.appliance_type), 1), createBaseVNode("div", _hoisted_35$6, toDisplayString(t.brand), 1)]),
						createBaseVNode("td", _hoisted_36$5, toDisplayString(t.technician_name || "لم يعين"), 1),
						createBaseVNode("td", _hoisted_37$5, [createBaseVNode("span", { class: normalizeClass(["px-2.5 py-1 rounded-full text-[11px] font-bold border", unref(TICKET_STATUS_MAP)[t.status]?.badgeClass]) }, toDisplayString(unref(TICKET_STATUS_MAP)[t.status]?.label), 3)]),
						createBaseVNode("td", _hoisted_38$4, toDisplayString(t.total_amount) + " ج.م", 1),
						createBaseVNode("td", _hoisted_39$4, [createBaseVNode("div", _hoisted_40$4, [createBaseVNode("button", {
							type: "button",
							onClick: ($event) => unref(appStore).openPrintModal(t, "invoice_warranty"),
							class: "p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 transition cursor-pointer",
							title: "طباعة فاتورة وشهادة ضمان (A4 / 80mm)"
						}, [createVNode(unref(Printer), { class: "w-4 h-4" })], 8, _hoisted_41$4), createBaseVNode("button", {
							type: "button",
							onClick: ($event) => unref(appStore).sendWhatsAppToCustomer(t),
							class: "p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 transition cursor-pointer",
							title: "إرسال تفاصيل الطلب والضمان واتساب"
						}, [createVNode(unref(MessageCircle), { class: "w-4 h-4" })], 8, _hoisted_42$4)])])
					]);
				}), 128)), stats.value.recentTickets.length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_43$4, [..._cache[19] || (_cache[19] = [createBaseVNode("td", {
					colspan: "7",
					class: "py-8 text-center text-slate-400"
				}, " لا توجد بلاغات صيانة مسجلة حالياً ", -1)])])) : createCommentVNode("", true)])])])]), createBaseVNode("div", _hoisted_44$4, [createBaseVNode("div", _hoisted_45$4, [_cache[23] || (_cache[23] = createBaseVNode("h3", { class: "font-extrabold text-sm text-slate-900 dark:text-white" }, " حالة التشغيل السريعة ", -1)), createBaseVNode("div", _hoisted_46$4, [createBaseVNode("div", _hoisted_47$4, [createBaseVNode("div", _hoisted_48$4, [createVNode(unref(CircleCheck), { class: "w-4 h-4" }), _cache[21] || (_cache[21] = createBaseVNode("span", null, "جاهز للتسليم", -1))]), createBaseVNode("div", _hoisted_49$4, toDisplayString(stats.value.repairedWaitingDeliveryCount) + " جهاز ", 1)]), createBaseVNode("div", _hoisted_50$2, [createBaseVNode("div", _hoisted_51$1, [createVNode(unref(Building2), { class: "w-4 h-4" }), _cache[22] || (_cache[22] = createBaseVNode("span", null, "بلاغات ضمان", -1))]), createBaseVNode("div", _hoisted_52$1, toDisplayString(stats.value.activeWarrantyClaimsCount) + " طلب ", 1)])])]), createBaseVNode("div", _hoisted_53$1, [createBaseVNode("div", _hoisted_54$1, [createBaseVNode("h3", _hoisted_55$1, [createVNode(unref(TriangleAlert), { class: "w-4 h-4" }), createTextVNode(" نواقص مخزن قطع الغيار (" + toDisplayString(stats.value.lowStockPartsCount) + ") ", 1)]), createBaseVNode("button", {
					type: "button",
					onClick: _cache[4] || (_cache[4] = ($event) => unref(router).push("/inventory")),
					class: "text-xs font-bold text-blue-600 hover:underline cursor-pointer"
				}, " توريد مخزن ")]), createBaseVNode("div", _hoisted_56$1, [(openBlock(true), createElementBlock(Fragment, null, renderList(stats.value.lowStockParts, (part) => {
					return openBlock(), createElementBlock("div", {
						key: part.id,
						class: "px-5 py-3 flex items-center justify-between"
					}, [createBaseVNode("div", null, [createBaseVNode("div", _hoisted_57$1, toDisplayString(part.name), 1), createBaseVNode("div", _hoisted_58$1, " كود: " + toDisplayString(part.code) + " | الماركة: " + toDisplayString(part.brand), 1)]), createBaseVNode("span", _hoisted_59$1, " متبقي " + toDisplayString(part.quantity), 1)]);
				}), 128)), stats.value.lowStockParts.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_60$1, " جميع قطع الغيار متوفرة بكميات آمنة ")) : createCommentVNode("", true)])])])])
			]);
		};
	}
});
// src/renderer/src/views/TicketsView.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$6 = { class: "space-y-5" };
var _hoisted_2$6 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs space-y-4" };
var _hoisted_3$6 = { class: "flex flex-wrap items-center justify-between gap-4" };
var _hoisted_4$6 = { class: "text-xl font-black text-slate-900 dark:text-white flex items-center gap-2" };
var _hoisted_5$6 = { class: "grid grid-cols-1 md:grid-cols-4 gap-3 text-xs" };
var _hoisted_6$6 = { class: "md:col-span-2 relative" };
var _hoisted_7$6 = ["value"];
var _hoisted_8$6 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden" };
var _hoisted_9$6 = { class: "overflow-x-auto" };
var _hoisted_10$6 = { class: "w-full text-right text-xs" };
var _hoisted_11$6 = { class: "divide-y divide-slate-200 dark:divide-slate-800" };
var _hoisted_12$6 = { class: "py-3.5 px-4" };
var _hoisted_13$6 = { class: "font-mono font-black text-blue-600 dark:text-blue-400" };
var _hoisted_14$6 = { class: "text-[11px] text-slate-500" };
var _hoisted_15$6 = {
	key: 0,
	class: "inline-block mt-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 text-[10px] font-bold"
};
var _hoisted_16$6 = { class: "py-3.5 px-4" };
var _hoisted_17$6 = { class: "font-bold text-slate-900 dark:text-white" };
var _hoisted_18$6 = { class: "text-slate-500 font-mono" };
var _hoisted_19$6 = {
	key: 0,
	class: "text-[11px] text-slate-500"
};
var _hoisted_20$6 = { class: "py-3.5 px-4 max-w-xs" };
var _hoisted_21$6 = { class: "font-bold text-slate-900 dark:text-white" };
var _hoisted_22$6 = { class: "text-blue-600" };
var _hoisted_23$6 = { class: "text-[11px] text-slate-600 dark:text-slate-400 truncate" };
var _hoisted_24$6 = {
	key: 0,
	class: "text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5"
};
var _hoisted_25$6 = { class: "py-3.5 px-4" };
var _hoisted_26$6 = { class: "inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300" };
var _hoisted_27$5 = { class: "text-[11px] text-slate-500 mt-0.5" };
var _hoisted_28$5 = { class: "text-slate-800 dark:text-slate-200" };
var _hoisted_29$5 = { class: "py-3.5 px-4" };
var _hoisted_30$5 = { class: "py-3.5 px-4" };
var _hoisted_31$5 = { class: "font-black text-slate-900 dark:text-white" };
var _hoisted_32$5 = { class: "text-[11px] text-emerald-600 font-bold" };
var _hoisted_33$5 = {
	key: 0,
	class: "text-[11px] text-rose-600 font-bold"
};
var _hoisted_34$5 = { class: "py-3.5 px-4" };
var _hoisted_35$5 = {
	key: 0,
	class: "font-bold text-emerald-700 dark:text-emerald-400"
};
var _hoisted_36$4 = {
	key: 1,
	class: "text-slate-400"
};
var _hoisted_37$4 = {
	key: 2,
	class: "text-[10px] text-slate-500"
};
var _hoisted_38$3 = { class: "py-3.5 px-4" };
var _hoisted_39$3 = { class: "flex items-center gap-1.5" };
var _hoisted_40$3 = ["onClick"];
var _hoisted_41$3 = ["onClick"];
var _hoisted_42$3 = ["onClick"];
var _hoisted_43$3 = ["onClick"];
var _hoisted_44$3 = ["onClick"];
var _hoisted_45$3 = { key: 0 };
var _hoisted_46$3 = {
	key: 0,
	class: "fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 overflow-y-auto"
};
var _hoisted_47$3 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[93vh] flex flex-col overflow-hidden" };
var _hoisted_48$3 = { class: "px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" };
var _hoisted_49$3 = { class: "font-black text-base text-slate-900 dark:text-white flex items-center gap-2" };
var _hoisted_50$1 = { class: "flex-1 overflow-y-auto p-6 space-y-5 text-xs" };
var _hoisted_51 = {
	key: 0,
	class: "p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold"
};
var _hoisted_52 = {
	key: 1,
	class: "p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 dark:border-amber-700 flex flex-wrap items-center justify-between gap-3"
};
var _hoisted_53 = { class: "flex items-center gap-2.5 text-amber-900 dark:text-amber-200" };
var _hoisted_54 = { class: "text-xs mt-0.5" };
var _hoisted_55 = { class: "p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3" };
var _hoisted_56 = { class: "grid grid-cols-1 md:grid-cols-4 gap-3" };
var _hoisted_57 = {
	key: 0,
	class: "pt-2"
};
var _hoisted_58 = { class: "flex flex-wrap gap-2 mt-1.5" };
var _hoisted_59 = ["onClick"];
var _hoisted_60 = { key: 0 };
var _hoisted_61 = { class: "p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3" };
var _hoisted_62 = { class: "grid grid-cols-1 md:grid-cols-4 gap-3" };
var _hoisted_63 = ["value"];
var _hoisted_64 = ["value"];
var _hoisted_65 = { class: "grid grid-cols-1 md:grid-cols-4 gap-3" };
var _hoisted_66 = ["value"];
var _hoisted_67 = ["value"];
var _hoisted_68 = { class: "grid grid-cols-1 md:grid-cols-2 gap-3" };
var _hoisted_69 = { class: "p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3" };
var _hoisted_70 = { class: "flex flex-wrap items-end gap-2" };
var _hoisted_71 = { class: "flex-1 min-w-[240px]" };
var _hoisted_72 = ["value", "disabled"];
var _hoisted_73 = { class: "w-24" };
var _hoisted_74 = {
	key: 0,
	class: "border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900"
};
var _hoisted_75 = { class: "w-full text-right text-xs" };
var _hoisted_76 = { class: "divide-y divide-slate-200 dark:divide-slate-800" };
var _hoisted_77 = { class: "py-2 px-3 font-mono" };
var _hoisted_78 = { class: "py-2 px-3 font-bold" };
var _hoisted_79 = { class: "py-2 px-3" };
var _hoisted_80 = { class: "py-2 px-3" };
var _hoisted_81 = ["onUpdate:modelValue", "onInput"];
var _hoisted_82 = { class: "py-2 px-3 font-bold" };
var _hoisted_83 = { class: "py-2 px-3" };
var _hoisted_84 = ["onClick"];
var _hoisted_85 = { class: "p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 space-y-3" };
var _hoisted_86 = { class: "grid grid-cols-2 md:grid-cols-6 gap-3" };
var _hoisted_87 = ["value"];
var _hoisted_88 = ["value"];
var _hoisted_89 = { class: "grid grid-cols-1 md:grid-cols-3 gap-3 items-center pt-2" };
var _hoisted_90 = { class: "md:col-span-2 flex items-center justify-around p-3 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-slate-700" };
var _hoisted_91 = { class: "text-center" };
var _hoisted_92 = { class: "text-lg font-black text-blue-600 dark:text-blue-400" };
var _hoisted_93 = { class: "text-center" };
var _hoisted_94 = { class: "text-lg font-black text-emerald-600" };
var _hoisted_95 = { class: "text-center" };
var _hoisted_96 = { class: "text-lg font-black text-rose-600" };
var _hoisted_97 = { class: "px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-end gap-3 text-xs" };
// src/renderer/src/views/TicketsView.vue
var TicketsView_default = /* @__PURE__ */ defineComponent({
	__name: "TicketsView",
	setup(__props) {
		const route = useRoute();
		const appStore = useAppStore();
		const tickets = /* @__PURE__ */ ref([]);
		const technicians = /* @__PURE__ */ ref([]);
		const spareParts = /* @__PURE__ */ ref([]);
		const searchQuery = /* @__PURE__ */ ref("");
		const statusFilter = /* @__PURE__ */ ref("all");
		const serviceTypeFilter = /* @__PURE__ */ ref("all");
		const modalOpen = /* @__PURE__ */ ref(false);
		const errorMsg = /* @__PURE__ */ ref("");
		const existingAppliances = /* @__PURE__ */ ref([]);
		const previousTickets = /* @__PURE__ */ ref([]);
		const activeWarrantyAlert = /* @__PURE__ */ ref(null);
		const selectedPartId = /* @__PURE__ */ ref(null);
		const selectedPartQty = /* @__PURE__ */ ref(1);
		const form = /* @__PURE__ */ ref({
			customer_name: "",
			customer_phone: "",
			customer_phone2: "",
			customer_area: "",
			customer_address: "",
			appliance_type: APPLIANCE_TYPES[0],
			brand: APPLIANCE_BRANDS[0],
			model: "",
			serial_number: "",
			service_type: "home_visit",
			status: "new",
			priority: "normal",
			complaint: "",
			diagnosis: "",
			technician_id: null,
			scheduled_date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
			inspection_fee: 150,
			labor_cost: 0,
			discount: 0,
			paid_amount: 0,
			payment_method: "cash",
			warranty_months: 6,
			is_under_previous_warranty: 0,
			previous_ticket_number: null,
			notes: "",
			parts: []
		});
		const computedPartsTotal = computed(() => form.value.parts.reduce((sum, p) => sum + Number(p.quantity) * Number(p.unit_price), 0));
		const computedTotalAmount = computed(() => Math.max(0, Number(form.value.inspection_fee || 0) + Number(form.value.labor_cost || 0) + computedPartsTotal.value - Number(form.value.discount || 0)));
		const computedRemainingAmount = computed(() => Math.max(0, computedTotalAmount.value - Number(form.value.paid_amount || 0)));
		async function loadData() {
			const [ticketRows, techRows, partRows] = await Promise.all([
				window.api.listTickets({
					search: searchQuery.value,
					status: statusFilter.value,
					service_type: serviceTypeFilter.value
				}),
				window.api.listTechnicians(),
				window.api.listSpareParts()
			]);
			tickets.value = ticketRows;
			technicians.value = techRows;
			spareParts.value = partRows;
		}
		watch([
			searchQuery,
			statusFilter,
			serviceTypeFilter
		], () => {
			loadData();
		});
		async function handlePhoneLookup() {
			const phone = form.value.customer_phone.trim();
			if (phone.length < 8) {
				existingAppliances.value = [];
				previousTickets.value = [];
				activeWarrantyAlert.value = null;
				return;
			}
			const res = await window.api.findCustomerByPhone(phone);
			if (res.customer) {
				if (!form.value.id) {
					form.value.customer_id = res.customer.id;
					form.value.customer_name = res.customer.name;
					form.value.customer_phone2 = res.customer.phone2 || "";
					form.value.customer_area = res.customer.area || "";
					form.value.customer_address = res.customer.address || "";
				}
				existingAppliances.value = res.appliances;
				previousTickets.value = res.previousTickets;
				const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
				const underWarrantyTicket = res.previousTickets.find((t) => t.warranty_end_date && t.warranty_end_date >= today);
				if (underWarrantyTicket) activeWarrantyAlert.value = {
					ticket_number: underWarrantyTicket.ticket_number,
					appliance_type: underWarrantyTicket.appliance_type,
					brand: underWarrantyTicket.brand,
					warranty_end_date: underWarrantyTicket.warranty_end_date
				};
				else activeWarrantyAlert.value = null;
			} else {
				existingAppliances.value = [];
				previousTickets.value = [];
				activeWarrantyAlert.value = null;
			}
		}
		function applyWarrantyReturnMode() {
			if (!activeWarrantyAlert.value) return;
			form.value.priority = "warranty_return";
			form.value.is_under_previous_warranty = 1;
			form.value.previous_ticket_number = activeWarrantyAlert.value.ticket_number;
			form.value.appliance_type = activeWarrantyAlert.value.appliance_type;
			form.value.brand = activeWarrantyAlert.value.brand;
			form.value.inspection_fee = 0;
		}
		function selectExistingAppliance(app) {
			form.value.appliance_type = app.appliance_type;
			form.value.brand = app.brand;
			form.value.model = app.model || "";
			form.value.serial_number = app.serial_number || "";
		}
		function addPartToTicket() {
			if (!selectedPartId.value) return;
			const part = spareParts.value.find((p) => p.id === selectedPartId.value);
			if (!part) return;
			const qty = Math.max(1, Number(selectedPartQty.value || 1));
			const existing = form.value.parts.find((p) => p.part_id === part.id);
			if (existing) {
				existing.quantity += qty;
				existing.total_price = existing.quantity * existing.unit_price;
			} else form.value.parts.push({
				part_id: part.id,
				part_name: part.name,
				part_code: part.code,
				quantity: qty,
				unit_cost: part.purchase_price,
				unit_price: part.selling_price,
				total_price: qty * part.selling_price
			});
			selectedPartId.value = null;
			selectedPartQty.value = 1;
		}
		function removePartFromTicket(index) {
			form.value.parts.splice(index, 1);
		}
		function openCreateModal() {
			errorMsg.value = "";
			existingAppliances.value = [];
			previousTickets.value = [];
			activeWarrantyAlert.value = null;
			form.value = {
				customer_name: "",
				customer_phone: "",
				customer_phone2: "",
				customer_area: "",
				customer_address: "",
				appliance_type: APPLIANCE_TYPES[0],
				brand: APPLIANCE_BRANDS[0],
				model: "",
				serial_number: "",
				service_type: "home_visit",
				status: "new",
				priority: "normal",
				complaint: "",
				diagnosis: "",
				technician_id: technicians.value[0]?.id || null,
				scheduled_date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
				inspection_fee: appStore.settings.default_inspection_fee || 150,
				labor_cost: 0,
				discount: 0,
				paid_amount: 0,
				payment_method: "cash",
				warranty_months: appStore.settings.default_warranty_months || 6,
				is_under_previous_warranty: 0,
				previous_ticket_number: null,
				notes: "",
				parts: []
			};
			modalOpen.value = true;
		}
		function openEditModal(t) {
			errorMsg.value = "";
			existingAppliances.value = [];
			previousTickets.value = [];
			activeWarrantyAlert.value = null;
			form.value = {
				id: t.id,
				ticket_number: t.ticket_number,
				customer_id: t.customer_id,
				customer_name: t.customer_name,
				customer_phone: t.customer_phone,
				customer_phone2: t.customer_phone2 || "",
				customer_area: t.customer_area || "",
				customer_address: t.customer_address || "",
				appliance_type: t.appliance_type,
				brand: t.brand,
				model: t.model || "",
				serial_number: t.serial_number || "",
				service_type: t.service_type,
				status: t.status,
				priority: t.priority,
				complaint: t.complaint,
				diagnosis: t.diagnosis || "",
				technician_id: t.technician_id,
				scheduled_date: t.scheduled_date,
				inspection_fee: t.inspection_fee,
				labor_cost: t.labor_cost,
				discount: t.discount,
				paid_amount: t.paid_amount,
				payment_method: t.payment_method,
				warranty_months: t.warranty_months,
				is_under_previous_warranty: t.is_under_previous_warranty,
				previous_ticket_number: t.previous_ticket_number,
				notes: t.notes || "",
				parts: t.parts ? t.parts.map((p) => ({ ...p })) : []
			};
			modalOpen.value = true;
		}
		async function handleSaveTicket(andPrint = false) {
			errorMsg.value = "";
			if (!form.value.customer_name.trim() || !form.value.customer_phone.trim()) {
				errorMsg.value = "يرجى إدخال اسم العميل ورقم الهاتف";
				return;
			}
			if (!form.value.complaint.trim()) {
				errorMsg.value = "يرجى كتابة شكوى العميل أو وصف العطل";
				return;
			}
			try {
				const saved = await window.api.saveTicket({ ...form.value });
				modalOpen.value = false;
				await loadData();
				if (andPrint) appStore.openPrintModal(saved, saved.status === "repaired" || saved.status === "delivered" ? "invoice_warranty" : "reception_receipt");
			} catch (err) {
				errorMsg.value = err instanceof Error ? err.message : "حدث خطأ أثناء حفظ الطلب";
			}
		}
		async function handleDeleteTicket(t) {
			if (!confirm(`هل أنت متأكد من حذف الطلب رقم ${t.ticket_number}؟ سيتم إرجاع أي قطع غيار للمخزن.`)) return;
			await window.api.deleteTicket(t.id);
			await loadData();
		}
		onMounted(async () => {
			await loadData();
			if (route.query.new === "1") openCreateModal();
		});
		return (_ctx, _cache) => {
			return openBlock(), createElementBlock("div", _hoisted_1$6, [
				createBaseVNode("div", _hoisted_2$6, [createBaseVNode("div", _hoisted_3$6, [createBaseVNode("div", null, [createBaseVNode("h1", _hoisted_4$6, [createVNode(unref(Wrench), { class: "w-5 h-5 text-blue-600" }), _cache[30] || (_cache[30] = createTextVNode(" إدارة بلاغات وطلبات الصيانة والضمان ", -1))]), _cache[31] || (_cache[31] = createBaseVNode("p", { class: "text-xs text-slate-500 dark:text-slate-400 mt-0.5" }, " تسجيل الزيارات المنزلية وأجهزة الورشة، صرف قطع الغيار، وإصدار الفواتير وشهادات الضمان (A4 / 80mm) ", -1))]), createBaseVNode("button", {
					type: "button",
					onClick: openCreateModal,
					class: "flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer"
				}, [createVNode(unref(CirclePlus), { class: "w-4 h-4" }), _cache[32] || (_cache[32] = createTextVNode(" تسجيل بلاغ صيانة جديد ", -1))])]), createBaseVNode("div", _hoisted_5$6, [
					createBaseVNode("div", _hoisted_6$6, [createVNode(unref(Search), { class: "w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" }), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => searchQuery.value = $event),
						type: "text",
						placeholder: "بحث برقم الطلب، اسم العميل، رقم الموبايل، نوع الجهاز، الماركة، أو السيريال...",
						class: "w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, searchQuery.value]])]),
					withDirectives(createBaseVNode("select", {
						"onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => statusFilter.value = $event),
						class: "px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, [_cache[33] || (_cache[33] = createBaseVNode("option", { value: "all" }, "جميع حالات الصيانة", -1)), (openBlock(true), createElementBlock(Fragment, null, renderList(unref(TICKET_STATUS_MAP), (info, key) => {
						return openBlock(), createElementBlock("option", {
							key,
							value: key
						}, toDisplayString(info.label), 9, _hoisted_7$6);
					}), 128))], 512), [[vModelSelect, statusFilter.value]]),
					withDirectives(createBaseVNode("select", {
						"onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => serviceTypeFilter.value = $event),
						class: "px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, [..._cache[34] || (_cache[34] = [
						createBaseVNode("option", { value: "all" }, "جميع أنواع الخدمة (منزلي + ورشة)", -1),
						createBaseVNode("option", { value: "home_visit" }, "زيارات منزلية فقط", -1),
						createBaseVNode("option", { value: "workshop" }, "أجهزة داخل الورشة فقط", -1)
					])], 512), [[vModelSelect, serviceTypeFilter.value]])
				])]),
				createBaseVNode("div", _hoisted_8$6, [createBaseVNode("div", _hoisted_9$6, [createBaseVNode("table", _hoisted_10$6, [_cache[39] || (_cache[39] = createBaseVNode("thead", { class: "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold" }, [createBaseVNode("tr", null, [
					createBaseVNode("th", { class: "py-3.5 px-4" }, "رقم الطلب"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "العميل والمنطقة"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "الجهاز والعطل"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "الخدمة والفني"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "الحالة"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "الحساب والمدفوع"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "الضمان"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "الطباعة والإجراءات")
				])], -1)), createBaseVNode("tbody", _hoisted_11$6, [(openBlock(true), createElementBlock(Fragment, null, renderList(tickets.value, (t) => {
					return openBlock(), createElementBlock("tr", {
						key: t.id,
						class: "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
					}, [
						createBaseVNode("td", _hoisted_12$6, [
							createBaseVNode("div", _hoisted_13$6, toDisplayString(t.ticket_number), 1),
							createBaseVNode("div", _hoisted_14$6, toDisplayString(t.scheduled_date), 1),
							t.is_under_previous_warranty || t.priority === "warranty_return" ? (openBlock(), createElementBlock("span", _hoisted_15$6, " 🛡️ إعادة بالضمان ")) : createCommentVNode("", true)
						]),
						createBaseVNode("td", _hoisted_16$6, [
							createBaseVNode("div", _hoisted_17$6, toDisplayString(t.customer_name), 1),
							createBaseVNode("div", _hoisted_18$6, toDisplayString(t.customer_phone), 1),
							t.customer_area ? (openBlock(), createElementBlock("div", _hoisted_19$6, " 📍 " + toDisplayString(t.customer_area), 1)) : createCommentVNode("", true)
						]),
						createBaseVNode("td", _hoisted_20$6, [
							createBaseVNode("div", _hoisted_21$6, [createTextVNode(toDisplayString(t.appliance_type) + " — ", 1), createBaseVNode("span", _hoisted_22$6, toDisplayString(t.brand), 1)]),
							createBaseVNode("div", _hoisted_23$6, toDisplayString(t.complaint), 1),
							t.parts && t.parts.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_24$6, " 🔧 قطع غيار مركبة: " + toDisplayString(t.parts.length), 1)) : createCommentVNode("", true)
						]),
						createBaseVNode("td", _hoisted_25$6, [createBaseVNode("div", _hoisted_26$6, [t.service_type === "home_visit" ? (openBlock(), createBlock(unref(House), {
							key: 0,
							class: "w-3.5 h-3.5 text-indigo-500"
						})) : (openBlock(), createBlock(unref(Building2), {
							key: 1,
							class: "w-3.5 h-3.5 text-amber-500"
						})), createBaseVNode("span", null, toDisplayString(t.service_type === "home_visit" ? "زيارة منزلية" : "بالورشة"), 1)]), createBaseVNode("div", _hoisted_27$5, [_cache[35] || (_cache[35] = createTextVNode(" الفني: ", -1)), createBaseVNode("strong", _hoisted_28$5, toDisplayString(t.technician_name || "لم يعين"), 1)])]),
						createBaseVNode("td", _hoisted_29$5, [createBaseVNode("span", { class: normalizeClass(["px-2.5 py-1 rounded-full text-[11px] font-bold border", unref(TICKET_STATUS_MAP)[t.status]?.badgeClass]) }, toDisplayString(unref(TICKET_STATUS_MAP)[t.status]?.label), 3)]),
						createBaseVNode("td", _hoisted_30$5, [
							createBaseVNode("div", _hoisted_31$5, " الإجمالي: " + toDisplayString(t.total_amount) + " ج.م ", 1),
							createBaseVNode("div", _hoisted_32$5, " مدفوع: " + toDisplayString(t.paid_amount) + " ج.م ", 1),
							t.remaining_amount > 0 ? (openBlock(), createElementBlock("div", _hoisted_33$5, " متبقي: " + toDisplayString(t.remaining_amount) + " ج.م ", 1)) : createCommentVNode("", true)
						]),
						createBaseVNode("td", _hoisted_34$5, [t.warranty_months > 0 ? (openBlock(), createElementBlock("div", _hoisted_35$5, toDisplayString(t.warranty_months) + " شهور ", 1)) : (openBlock(), createElementBlock("div", _hoisted_36$4, "بدون ضمان")), t.warranty_end_date ? (openBlock(), createElementBlock("div", _hoisted_37$4, " حتى " + toDisplayString(t.warranty_end_date), 1)) : createCommentVNode("", true)]),
						createBaseVNode("td", _hoisted_38$3, [createBaseVNode("div", _hoisted_39$3, [
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => unref(appStore).openPrintModal(t, "invoice_warranty", "a4"),
								class: "px-2 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer",
								title: "طباعة فاتورة وشهادة ضمان A4"
							}, [createVNode(unref(Printer), { class: "w-3.5 h-3.5" }), _cache[36] || (_cache[36] = createTextVNode(" A4 ", -1))], 8, _hoisted_40$3),
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => unref(appStore).openPrintModal(t, "reception_receipt", "thermal80"),
								class: "px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer",
								title: "طباعة إيصال حراري 80mm"
							}, [createVNode(unref(Printer), { class: "w-3.5 h-3.5" }), _cache[37] || (_cache[37] = createTextVNode(" 80mm ", -1))], 8, _hoisted_41$3),
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => unref(appStore).sendWhatsAppToCustomer(t),
								class: "p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 transition cursor-pointer",
								title: "إرسال واتساب للعميل"
							}, [createVNode(unref(MessageCircle), { class: "w-4 h-4" })], 8, _hoisted_42$3),
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => openEditModal(t),
								class: "p-1.5 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-700 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer",
								title: "تعديل الطلب"
							}, [createVNode(unref(PenLine), { class: "w-4 h-4" })], 8, _hoisted_43$3),
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => handleDeleteTicket(t),
								class: "p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer",
								title: "حذف الطلب"
							}, [createVNode(unref(Trash2), { class: "w-4 h-4" })], 8, _hoisted_44$3)
						])])
					]);
				}), 128)), tickets.value.length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_45$3, [..._cache[38] || (_cache[38] = [createBaseVNode("td", {
					colspan: "8",
					class: "py-10 text-center text-slate-400"
				}, " لا توجد طلبات صيانة مطابقة للبحث ", -1)])])) : createCommentVNode("", true)])])])]),
				modalOpen.value ? (openBlock(), createElementBlock("div", _hoisted_46$3, [createBaseVNode("div", _hoisted_47$3, [
					createBaseVNode("div", _hoisted_48$3, [createBaseVNode("h3", _hoisted_49$3, [createVNode(unref(Wrench), { class: "w-5 h-5 text-blue-600" }), createBaseVNode("span", null, toDisplayString(form.value.id ? `تعديل طلب الصيانة (${form.value.ticket_number})` : "تسجيل بلاغ / طلب صيانة جديد"), 1)]), createBaseVNode("button", {
						type: "button",
						onClick: _cache[3] || (_cache[3] = ($event) => modalOpen.value = false),
						class: "p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
					}, [createVNode(unref(X), { class: "w-5 h-5" })])]),
					createBaseVNode("div", _hoisted_50$1, [
						errorMsg.value ? (openBlock(), createElementBlock("div", _hoisted_51, toDisplayString(errorMsg.value), 1)) : createCommentVNode("", true),
						activeWarrantyAlert.value ? (openBlock(), createElementBlock("div", _hoisted_52, [createBaseVNode("div", _hoisted_53, [createVNode(unref(ShieldAlert), { class: "w-6 h-6 text-amber-600 shrink-0" }), createBaseVNode("div", null, [_cache[41] || (_cache[41] = createBaseVNode("div", { class: "font-black text-sm" }, " تنبيه ضمان تلقائي: هذا العميل لديه جهاز داخل فترة الضمان! ", -1)), createBaseVNode("div", _hoisted_54, [
							_cache[40] || (_cache[40] = createTextVNode(" طلب رقم ", -1)),
							createBaseVNode("strong", null, toDisplayString(activeWarrantyAlert.value.ticket_number), 1),
							createTextVNode(" — جهاز (" + toDisplayString(activeWarrantyAlert.value.appliance_type) + " " + toDisplayString(activeWarrantyAlert.value.brand) + ") — الضمان ساري حتى ", 1),
							createBaseVNode("strong", null, toDisplayString(activeWarrantyAlert.value.warranty_end_date), 1)
						])])]), createBaseVNode("button", {
							type: "button",
							onClick: applyWarrantyReturnMode,
							class: "px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
						}, " تسجيل كإعادة صيانة بالضمان (مجاناً) ")])) : createCommentVNode("", true),
						createBaseVNode("div", _hoisted_55, [
							_cache[48] || (_cache[48] = createBaseVNode("h4", { class: "font-black text-slate-900 dark:text-white text-sm" }, " 1. بيانات العميل (اكتب رقم الموبايل للبحث التلقائي عن العميل وأجهزته) ", -1)),
							createBaseVNode("div", _hoisted_56, [
								createBaseVNode("div", null, [_cache[42] || (_cache[42] = createBaseVNode("label", { class: "block font-bold mb-1" }, "رقم الموبايل الأساسي *", -1)), withDirectives(createBaseVNode("input", {
									"onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.customer_phone = $event),
									onInput: handlePhoneLookup,
									type: "text",
									placeholder: "010xxxxxxxx",
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold"
								}, null, 544), [[vModelText, form.value.customer_phone]])]),
								createBaseVNode("div", null, [_cache[43] || (_cache[43] = createBaseVNode("label", { class: "block font-bold mb-1" }, "اسم العميل *", -1)), withDirectives(createBaseVNode("input", {
									"onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.value.customer_name = $event),
									type: "text",
									placeholder: "اسم العميل ثلاثي",
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
								}, null, 512), [[vModelText, form.value.customer_name]])]),
								createBaseVNode("div", null, [_cache[44] || (_cache[44] = createBaseVNode("label", { class: "block font-bold mb-1" }, "رقم هاتف إضافي", -1)), withDirectives(createBaseVNode("input", {
									"onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.value.customer_phone2 = $event),
									type: "text",
									placeholder: "011xxxxxxxx",
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
								}, null, 512), [[vModelText, form.value.customer_phone2]])]),
								createBaseVNode("div", null, [_cache[45] || (_cache[45] = createBaseVNode("label", { class: "block font-bold mb-1" }, "المنطقة / الحي", -1)), withDirectives(createBaseVNode("input", {
									"onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.value.customer_area = $event),
									type: "text",
									placeholder: "مثال: مدينة نصر / المعادي",
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
								}, null, 512), [[vModelText, form.value.customer_area]])])
							]),
							createBaseVNode("div", null, [_cache[46] || (_cache[46] = createBaseVNode("label", { class: "block font-bold mb-1" }, "العنوان التفصيلي للزيارة المنزلية", -1)), withDirectives(createBaseVNode("input", {
								"onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.value.customer_address = $event),
								type: "text",
								placeholder: "اسم الشارع - رقم العمارة - الدور - الشقة - علامة مميزة",
								class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
							}, null, 512), [[vModelText, form.value.customer_address]])]),
							existingAppliances.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_57, [_cache[47] || (_cache[47] = createBaseVNode("span", { class: "font-bold text-blue-600 dark:text-blue-400 ml-2" }, " أجهزة العميل المسجلة سابقاً (اضغط للاختيار السريع): ", -1)), createBaseVNode("div", _hoisted_58, [(openBlock(true), createElementBlock(Fragment, null, renderList(existingAppliances.value, (app) => {
								return openBlock(), createElementBlock("button", {
									key: app.id,
									type: "button",
									onClick: ($event) => selectExistingAppliance(app),
									class: "px-3 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-bold cursor-pointer"
								}, [createTextVNode(" 🔌 " + toDisplayString(app.appliance_type) + " (" + toDisplayString(app.brand) + ") ", 1), app.last_warranty_end ? (openBlock(), createElementBlock("span", _hoisted_60, " — ضمان حتى " + toDisplayString(app.last_warranty_end), 1)) : createCommentVNode("", true)], 8, _hoisted_59);
							}), 128))])])) : createCommentVNode("", true)
						]),
						createBaseVNode("div", _hoisted_61, [
							_cache[61] || (_cache[61] = createBaseVNode("h4", { class: "font-black text-slate-900 dark:text-white text-sm" }, " 2. بيانات الجهاز الكهربائي وتفاصيل الخدمة ", -1)),
							createBaseVNode("div", _hoisted_62, [
								createBaseVNode("div", null, [_cache[49] || (_cache[49] = createBaseVNode("label", { class: "block font-bold mb-1" }, "نوع الجهاز *", -1)), withDirectives(createBaseVNode("select", {
									"onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.value.appliance_type = $event),
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
								}, [(openBlock(true), createElementBlock(Fragment, null, renderList(unref(APPLIANCE_TYPES), (t) => {
									return openBlock(), createElementBlock("option", {
										key: t,
										value: t
									}, toDisplayString(t), 9, _hoisted_63);
								}), 128))], 512), [[vModelSelect, form.value.appliance_type]])]),
								createBaseVNode("div", null, [_cache[50] || (_cache[50] = createBaseVNode("label", { class: "block font-bold mb-1" }, "الماركة (Brand) *", -1)), withDirectives(createBaseVNode("select", {
									"onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.value.brand = $event),
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
								}, [(openBlock(true), createElementBlock(Fragment, null, renderList(unref(APPLIANCE_BRANDS), (b) => {
									return openBlock(), createElementBlock("option", {
										key: b,
										value: b
									}, toDisplayString(b), 9, _hoisted_64);
								}), 128))], 512), [[vModelSelect, form.value.brand]])]),
								createBaseVNode("div", null, [_cache[51] || (_cache[51] = createBaseVNode("label", { class: "block font-bold mb-1" }, "الموديل / السعة", -1)), withDirectives(createBaseVNode("input", {
									"onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.value.model = $event),
									type: "text",
									placeholder: "مثال: 8 كيلو انفرتر / 16 قدم",
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
								}, null, 512), [[vModelText, form.value.model]])]),
								createBaseVNode("div", null, [_cache[52] || (_cache[52] = createBaseVNode("label", { class: "block font-bold mb-1" }, "رقم السيريال (Serial Number)", -1)), withDirectives(createBaseVNode("input", {
									"onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.value.serial_number = $event),
									type: "text",
									placeholder: "اختياري",
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
								}, null, 512), [[vModelText, form.value.serial_number]])])
							]),
							createBaseVNode("div", _hoisted_65, [
								createBaseVNode("div", null, [_cache[54] || (_cache[54] = createBaseVNode("label", { class: "block font-bold mb-1" }, "نوع الخدمة *", -1)), withDirectives(createBaseVNode("select", {
									"onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => form.value.service_type = $event),
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
								}, [..._cache[53] || (_cache[53] = [createBaseVNode("option", { value: "home_visit" }, "🏠 زيارة منزلية", -1), createBaseVNode("option", { value: "workshop" }, "🏢 استلام بالورشة", -1)])], 512), [[vModelSelect, form.value.service_type]])]),
								createBaseVNode("div", null, [_cache[55] || (_cache[55] = createBaseVNode("label", { class: "block font-bold mb-1" }, "حالة الطلب *", -1)), withDirectives(createBaseVNode("select", {
									"onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => form.value.status = $event),
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
								}, [(openBlock(true), createElementBlock(Fragment, null, renderList(unref(TICKET_STATUS_MAP), (info, k) => {
									return openBlock(), createElementBlock("option", {
										key: k,
										value: k
									}, toDisplayString(info.label), 9, _hoisted_66);
								}), 128))], 512), [[vModelSelect, form.value.status]])]),
								createBaseVNode("div", null, [_cache[57] || (_cache[57] = createBaseVNode("label", { class: "block font-bold mb-1" }, "تعيين الفني المسؤول", -1)), withDirectives(createBaseVNode("select", {
									"onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => form.value.technician_id = $event),
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
								}, [_cache[56] || (_cache[56] = createBaseVNode("option", { value: null }, "-- لم يعين بعد --", -1)), (openBlock(true), createElementBlock(Fragment, null, renderList(technicians.value, (tech) => {
									return openBlock(), createElementBlock("option", {
										key: tech.id,
										value: tech.id
									}, toDisplayString(tech.name) + " (" + toDisplayString(tech.specialty) + ") ", 9, _hoisted_67);
								}), 128))], 512), [[vModelSelect, form.value.technician_id]])]),
								createBaseVNode("div", null, [_cache[58] || (_cache[58] = createBaseVNode("label", { class: "block font-bold mb-1" }, "تاريخ الزيارة / الاستلام", -1)), withDirectives(createBaseVNode("input", {
									"onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => form.value.scheduled_date = $event),
									type: "date",
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
								}, null, 512), [[vModelText, form.value.scheduled_date]])])
							]),
							createBaseVNode("div", _hoisted_68, [createBaseVNode("div", null, [_cache[59] || (_cache[59] = createBaseVNode("label", { class: "block font-bold mb-1" }, "شكوى العميل / العطل المبلّغ عنه *", -1)), withDirectives(createBaseVNode("textarea", {
								"onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => form.value.complaint = $event),
								rows: "2",
								placeholder: "مثال: الغسالة لا تصرف المياه وتصدر صوت عالي في العصر...",
								class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
							}, null, 512), [[vModelText, form.value.complaint]])]), createBaseVNode("div", null, [_cache[60] || (_cache[60] = createBaseVNode("label", { class: "block font-bold mb-1" }, "التشخيص الفني وما تم عمله", -1)), withDirectives(createBaseVNode("textarea", {
								"onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => form.value.diagnosis = $event),
								rows: "2",
								placeholder: "مثال: تم الكشف وتغيير طلمبة الطرد وتنظيف الفلتر وتجربة الجهاز...",
								class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
							}, null, 512), [[vModelText, form.value.diagnosis]])])])
						]),
						createBaseVNode("div", _hoisted_69, [
							_cache[67] || (_cache[67] = createBaseVNode("h4", { class: "font-black text-slate-900 dark:text-white text-sm" }, " 3. قطع الغيار المنصرفة للطلب (تُخصم تلقائياً من المخزن وتُضاف للفاتورة) ", -1)),
							createBaseVNode("div", _hoisted_70, [
								createBaseVNode("div", _hoisted_71, [_cache[63] || (_cache[63] = createBaseVNode("label", { class: "block font-bold mb-1" }, "اختر قطعة غيار من المخزن", -1)), withDirectives(createBaseVNode("select", {
									"onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => selectedPartId.value = $event),
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
								}, [_cache[62] || (_cache[62] = createBaseVNode("option", { value: null }, "-- اختر قطعة غيار لإضافتها --", -1)), (openBlock(true), createElementBlock(Fragment, null, renderList(spareParts.value, (p) => {
									return openBlock(), createElementBlock("option", {
										key: p.id,
										value: p.id,
										disabled: p.quantity <= 0
									}, " [" + toDisplayString(p.code) + "] " + toDisplayString(p.name) + " — سعر البيع: " + toDisplayString(p.selling_price) + " ج.م (المتاح: " + toDisplayString(p.quantity) + ") ", 9, _hoisted_72);
								}), 128))], 512), [[vModelSelect, selectedPartId.value]])]),
								createBaseVNode("div", _hoisted_73, [_cache[64] || (_cache[64] = createBaseVNode("label", { class: "block font-bold mb-1" }, "الكمية", -1)), withDirectives(createBaseVNode("input", {
									"onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => selectedPartQty.value = $event),
									type: "number",
									min: "1",
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-center"
								}, null, 512), [[
									vModelText,
									selectedPartQty.value,
									void 0,
									{ number: true }
								]])]),
								createBaseVNode("button", {
									type: "button",
									onClick: addPartToTicket,
									class: "flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
								}, [createVNode(unref(PackagePlus), { class: "w-4 h-4" }), _cache[65] || (_cache[65] = createTextVNode(" إضافة للطلب ", -1))])
							]),
							form.value.parts.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_74, [createBaseVNode("table", _hoisted_75, [_cache[66] || (_cache[66] = createBaseVNode("thead", { class: "bg-slate-100 dark:bg-slate-800 font-bold" }, [createBaseVNode("tr", null, [
								createBaseVNode("th", { class: "py-2 px-3" }, "الكود"),
								createBaseVNode("th", { class: "py-2 px-3" }, "اسم القطعة"),
								createBaseVNode("th", { class: "py-2 px-3" }, "الكمية"),
								createBaseVNode("th", { class: "py-2 px-3" }, "سعر البيع للوحدة"),
								createBaseVNode("th", { class: "py-2 px-3" }, "الإجمالي"),
								createBaseVNode("th", { class: "py-2 px-3" }, "حذف")
							])], -1)), createBaseVNode("tbody", _hoisted_76, [(openBlock(true), createElementBlock(Fragment, null, renderList(form.value.parts, (item, idx) => {
								return openBlock(), createElementBlock("tr", { key: idx }, [
									createBaseVNode("td", _hoisted_77, toDisplayString(item.part_code), 1),
									createBaseVNode("td", _hoisted_78, toDisplayString(item.part_name), 1),
									createBaseVNode("td", _hoisted_79, toDisplayString(item.quantity), 1),
									createBaseVNode("td", _hoisted_80, [withDirectives(createBaseVNode("input", {
										"onUpdate:modelValue": ($event) => item.unit_price = $event,
										onInput: ($event) => item.total_price = item.quantity * item.unit_price,
										type: "number",
										class: "w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
									}, null, 40, _hoisted_81), [[
										vModelText,
										item.unit_price,
										void 0,
										{ number: true }
									]])]),
									createBaseVNode("td", _hoisted_82, toDisplayString(item.quantity * item.unit_price) + " ج.م", 1),
									createBaseVNode("td", _hoisted_83, [createBaseVNode("button", {
										type: "button",
										onClick: ($event) => removePartFromTicket(idx),
										class: "text-rose-600 hover:underline font-bold cursor-pointer"
									}, " حذف ", 8, _hoisted_84)])
								]);
							}), 128))])])])) : createCommentVNode("", true)
						]),
						createBaseVNode("div", _hoisted_85, [
							_cache[79] || (_cache[79] = createBaseVNode("h4", { class: "font-black text-slate-900 dark:text-white text-sm" }, " 4. الحساب المالي وشهادة الضمان ", -1)),
							createBaseVNode("div", _hoisted_86, [
								createBaseVNode("div", null, [_cache[68] || (_cache[68] = createBaseVNode("label", { class: "block font-bold mb-1" }, "رسوم الكشف", -1)), withDirectives(createBaseVNode("input", {
									"onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => form.value.inspection_fee = $event),
									type: "number",
									min: "0",
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
								}, null, 512), [[
									vModelText,
									form.value.inspection_fee,
									void 0,
									{ number: true }
								]])]),
								createBaseVNode("div", null, [_cache[69] || (_cache[69] = createBaseVNode("label", { class: "block font-bold mb-1" }, "المصنعية والإصلاح", -1)), withDirectives(createBaseVNode("input", {
									"onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => form.value.labor_cost = $event),
									type: "number",
									min: "0",
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
								}, null, 512), [[
									vModelText,
									form.value.labor_cost,
									void 0,
									{ number: true }
								]])]),
								createBaseVNode("div", null, [_cache[70] || (_cache[70] = createBaseVNode("label", { class: "block font-bold mb-1" }, "إجمالي قطع الغيار", -1)), createBaseVNode("input", {
									value: computedPartsTotal.value,
									disabled: "",
									type: "number",
									class: "w-full px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
								}, null, 8, _hoisted_87)]),
								createBaseVNode("div", null, [_cache[71] || (_cache[71] = createBaseVNode("label", { class: "block font-bold mb-1" }, "خصم للعميل", -1)), withDirectives(createBaseVNode("input", {
									"onUpdate:modelValue": _cache[23] || (_cache[23] = ($event) => form.value.discount = $event),
									type: "number",
									min: "0",
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
								}, null, 512), [[
									vModelText,
									form.value.discount,
									void 0,
									{ number: true }
								]])]),
								createBaseVNode("div", null, [_cache[72] || (_cache[72] = createBaseVNode("label", { class: "block font-bold mb-1 text-emerald-700 dark:text-emerald-400" }, " المبلغ المدفوع (المحصل) ", -1)), withDirectives(createBaseVNode("input", {
									"onUpdate:modelValue": _cache[24] || (_cache[24] = ($event) => form.value.paid_amount = $event),
									type: "number",
									min: "0",
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border-2 border-emerald-500 font-black"
								}, null, 512), [[
									vModelText,
									form.value.paid_amount,
									void 0,
									{ number: true }
								]])]),
								createBaseVNode("div", null, [_cache[73] || (_cache[73] = createBaseVNode("label", { class: "block font-bold mb-1" }, "طريقة الدفع", -1)), withDirectives(createBaseVNode("select", {
									"onUpdate:modelValue": _cache[25] || (_cache[25] = ($event) => form.value.payment_method = $event),
									class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
								}, [(openBlock(true), createElementBlock(Fragment, null, renderList(unref(PAYMENT_METHODS), (label, k) => {
									return openBlock(), createElementBlock("option", {
										key: k,
										value: k
									}, toDisplayString(label), 9, _hoisted_88);
								}), 128))], 512), [[vModelSelect, form.value.payment_method]])])
							]),
							createBaseVNode("div", _hoisted_89, [createBaseVNode("div", null, [_cache[75] || (_cache[75] = createBaseVNode("label", { class: "block font-bold mb-1" }, "مدة الضمان الممنوحة للعميل", -1)), withDirectives(createBaseVNode("select", {
								"onUpdate:modelValue": _cache[26] || (_cache[26] = ($event) => form.value.warranty_months = $event),
								class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
							}, [..._cache[74] || (_cache[74] = [
								createBaseVNode("option", { value: 0 }, "بدون ضمان (كشف فقط)", -1),
								createBaseVNode("option", { value: 1 }, "ضمان شهر واحد", -1),
								createBaseVNode("option", { value: 3 }, "ضمان 3 شهور", -1),
								createBaseVNode("option", { value: 6 }, "ضمان 6 شهور", -1),
								createBaseVNode("option", { value: 12 }, "ضمان سنة كاملة (12 شهر)", -1)
							])], 512), [[
								vModelSelect,
								form.value.warranty_months,
								void 0,
								{ number: true }
							]])]), createBaseVNode("div", _hoisted_90, [
								createBaseVNode("div", _hoisted_91, [_cache[76] || (_cache[76] = createBaseVNode("span", { class: "text-slate-500 block" }, "الإجمالي النهائي", -1)), createBaseVNode("span", _hoisted_92, toDisplayString(computedTotalAmount.value) + " ج.م ", 1)]),
								createBaseVNode("div", _hoisted_93, [_cache[77] || (_cache[77] = createBaseVNode("span", { class: "text-slate-500 block" }, "المدفوع", -1)), createBaseVNode("span", _hoisted_94, toDisplayString(form.value.paid_amount) + " ج.م ", 1)]),
								createBaseVNode("div", _hoisted_95, [_cache[78] || (_cache[78] = createBaseVNode("span", { class: "text-slate-500 block" }, "المتبقي على العميل", -1)), createBaseVNode("span", _hoisted_96, toDisplayString(computedRemainingAmount.value) + " ج.م ", 1)])
							])])
						])
					]),
					createBaseVNode("div", _hoisted_97, [
						createBaseVNode("button", {
							type: "button",
							onClick: _cache[27] || (_cache[27] = ($event) => modalOpen.value = false),
							class: "px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
						}, " إلغاء "),
						createBaseVNode("button", {
							type: "button",
							onClick: _cache[28] || (_cache[28] = ($event) => handleSaveTicket(false)),
							class: "px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
						}, " حفظ بيانات الطلب "),
						createBaseVNode("button", {
							type: "button",
							onClick: _cache[29] || (_cache[29] = ($event) => handleSaveTicket(true)),
							class: "flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md cursor-pointer"
						}, [createVNode(unref(Printer), { class: "w-4 h-4" }), _cache[80] || (_cache[80] = createTextVNode(" حفظ وطباعة الإيصال / شهادة الضمان ", -1))])
					])
				])])) : createCommentVNode("", true)
			]);
		};
	}
});
// src/renderer/src/views/CustomersView.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$5 = { class: "space-y-5" };
var _hoisted_2$5 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4" };
var _hoisted_3$5 = { class: "text-xl font-black text-slate-900 dark:text-white flex items-center gap-2" };
var _hoisted_4$5 = { class: "flex items-center gap-3" };
var _hoisted_5$5 = { class: "relative w-72 text-xs" };
var _hoisted_6$5 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden" };
var _hoisted_7$5 = { class: "w-full text-right text-xs" };
var _hoisted_8$5 = { class: "divide-y divide-slate-200 dark:divide-slate-800" };
var _hoisted_9$5 = { class: "py-3.5 px-4 font-bold" };
var _hoisted_10$5 = { class: "py-3.5 px-4 font-bold text-slate-900 dark:text-white text-sm" };
var _hoisted_11$5 = { class: "py-3.5 px-4 font-mono" };
var _hoisted_12$5 = { class: "font-bold text-blue-600 dark:text-blue-400" };
var _hoisted_13$5 = {
	key: 0,
	class: "text-slate-500"
};
var _hoisted_14$5 = { class: "py-3.5 px-4" };
var _hoisted_15$5 = { class: "font-bold" };
var _hoisted_16$5 = { class: "text-slate-500" };
var _hoisted_17$5 = { class: "py-3.5 px-4" };
var _hoisted_18$5 = { class: "px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-bold" };
var _hoisted_19$5 = { class: "py-3.5 px-4 text-slate-500" };
var _hoisted_20$5 = { class: "py-3.5 px-4" };
var _hoisted_21$5 = { class: "flex items-center gap-1.5" };
var _hoisted_22$5 = ["onClick"];
var _hoisted_23$5 = ["onClick"];
var _hoisted_24$5 = ["onClick"];
var _hoisted_25$5 = ["onClick"];
var _hoisted_26$5 = {
	key: 0,
	class: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
};
var _hoisted_27$4 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" };
var _hoisted_28$4 = { class: "px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" };
var _hoisted_29$4 = { class: "font-bold text-sm" };
var _hoisted_30$4 = { class: "grid grid-cols-2 gap-3" };
var _hoisted_31$4 = { class: "flex justify-end gap-2 pt-3" };
var _hoisted_32$4 = {
	key: 1,
	class: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
};
var _hoisted_33$4 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden text-xs" };
var _hoisted_34$4 = { class: "px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" };
var _hoisted_35$4 = { class: "font-black text-sm" };
var _hoisted_36$3 = { class: "p-6 overflow-y-auto space-y-5" };
var _hoisted_37$3 = { class: "grid grid-cols-1 md:grid-cols-2 gap-3" };
var _hoisted_38$2 = { class: "font-bold text-sm" };
var _hoisted_39$2 = { class: "text-slate-500 mt-1" };
var _hoisted_40$2 = {
	key: 0,
	class: "mt-1.5 text-emerald-600 dark:text-emerald-400 font-bold"
};
var _hoisted_41$2 = {
	key: 0,
	class: "text-slate-400"
};
var _hoisted_42$2 = { class: "space-y-2" };
var _hoisted_43$2 = { class: "font-bold" };
var _hoisted_44$2 = { class: "font-mono text-blue-600" };
var _hoisted_45$2 = { class: "text-slate-500 mt-0.5" };
var _hoisted_46$2 = {
	key: 0,
	class: "text-emerald-600 font-semibold"
};
var _hoisted_47$2 = { class: "text-left space-y-1" };
var _hoisted_48$2 = { class: "font-black" };
var _hoisted_49$2 = ["onClick"];
// src/renderer/src/views/CustomersView.vue
var CustomersView_default = /* @__PURE__ */ defineComponent({
	__name: "CustomersView",
	setup(__props) {
		const appStore = useAppStore();
		const customers = /* @__PURE__ */ ref([]);
		const searchQuery = /* @__PURE__ */ ref("");
		const modalOpen = /* @__PURE__ */ ref(false);
		const historyModalOpen = /* @__PURE__ */ ref(false);
		const selectedCustomer = /* @__PURE__ */ ref(null);
		const customerAppliances = /* @__PURE__ */ ref([]);
		const customerTickets = /* @__PURE__ */ ref([]);
		const form = /* @__PURE__ */ ref({
			name: "",
			phone: "",
			phone2: "",
			area: "",
			address: "",
			notes: ""
		});
		async function loadCustomers() {
			customers.value = await window.api.listCustomers(searchQuery.value);
		}
		watch(searchQuery, () => {
			loadCustomers();
		});
		function openCreateModal() {
			form.value = {
				name: "",
				phone: "",
				phone2: "",
				area: "",
				address: "",
				notes: ""
			};
			modalOpen.value = true;
		}
		function openEditModal(c) {
			form.value = { ...c };
			modalOpen.value = true;
		}
		async function openHistoryModal(c) {
			selectedCustomer.value = c;
			const res = await window.api.findCustomerByPhone(c.phone);
			customerAppliances.value = res.appliances;
			customerTickets.value = res.previousTickets;
			historyModalOpen.value = true;
		}
		async function handleSaveCustomer() {
			if (!form.value.name?.trim() || !form.value.phone?.trim()) {
				alert("يرجى إدخال اسم العميل ورقم الهاتف");
				return;
			}
			await window.api.saveCustomer(form.value);
			modalOpen.value = false;
			await loadCustomers();
		}
		async function handleDeleteCustomer(c) {
			if (!confirm(`هل أنت متأكد من حذف ملف العميل "${c.name}"؟`)) return;
			try {
				await window.api.deleteCustomer(c.id);
				await loadCustomers();
			} catch {
				alert("لا يمكن حذف عميل مرتبط بطلبات صيانة سابقة حفاظاً على السجل المالي.");
			}
		}
		function openWhatsAppChat(phone, name) {
			let clean = phone.replace(/\D/g, "");
			if (clean.startsWith("01") && clean.length === 11) clean = "2" + clean;
			const text = `مرحباً بحضرتك أ/ ${name} من ${appStore.settings.center_name}`;
			window.api.openExternal(`https://wa.me/${clean}?text=${encodeURIComponent(text)}`);
		}
		onMounted(loadCustomers);
		return (_ctx, _cache) => {
			return openBlock(), createElementBlock("div", _hoisted_1$5, [
				createBaseVNode("div", _hoisted_2$5, [createBaseVNode("div", null, [createBaseVNode("h1", _hoisted_3$5, [createVNode(unref(Users), { class: "w-5 h-5 text-blue-600" }), _cache[10] || (_cache[10] = createTextVNode(" سجل العملاء وتاريخ صيانة الأجهزة والضمان ", -1))]), _cache[11] || (_cache[11] = createBaseVNode("p", { class: "text-xs text-slate-500 dark:text-slate-400 mt-0.5" }, " ملف شامل لكل عميل، أجهزته المنزلية المسجلة، تاريخ الأعطال السابقة، وشهادات الضمان السارية ", -1))]), createBaseVNode("div", _hoisted_4$5, [createBaseVNode("div", _hoisted_5$5, [createVNode(unref(Search), { class: "w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" }), withDirectives(createBaseVNode("input", {
					"onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => searchQuery.value = $event),
					type: "text",
					placeholder: "بحث بالاسم أو رقم الموبايل أو المنطقة...",
					class: "w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
				}, null, 512), [[vModelText, searchQuery.value]])]), createBaseVNode("button", {
					type: "button",
					onClick: openCreateModal,
					class: "flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md cursor-pointer"
				}, [createVNode(unref(UserPlus), { class: "w-4 h-4" }), _cache[12] || (_cache[12] = createTextVNode(" إضافة عميل جديد ", -1))])])]),
				createBaseVNode("div", _hoisted_6$5, [createBaseVNode("table", _hoisted_7$5, [_cache[14] || (_cache[14] = createBaseVNode("thead", { class: "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold" }, [createBaseVNode("tr", null, [
					createBaseVNode("th", { class: "py-3.5 px-4" }, "#"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "اسم العميل"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "أرقام الهاتف"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "المنطقة والعنوان"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "عدد طلبات الصيانة"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "ملاحظات"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "السجل والإجراءات")
				])], -1)), createBaseVNode("tbody", _hoisted_8$5, [(openBlock(true), createElementBlock(Fragment, null, renderList(customers.value, (c) => {
					return openBlock(), createElementBlock("tr", {
						key: c.id,
						class: "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
					}, [
						createBaseVNode("td", _hoisted_9$5, toDisplayString(c.id), 1),
						createBaseVNode("td", _hoisted_10$5, toDisplayString(c.name), 1),
						createBaseVNode("td", _hoisted_11$5, [createBaseVNode("div", _hoisted_12$5, toDisplayString(c.phone), 1), c.phone2 ? (openBlock(), createElementBlock("div", _hoisted_13$5, toDisplayString(c.phone2), 1)) : createCommentVNode("", true)]),
						createBaseVNode("td", _hoisted_14$5, [createBaseVNode("div", _hoisted_15$5, toDisplayString(c.area || "—"), 1), createBaseVNode("div", _hoisted_16$5, toDisplayString(c.address), 1)]),
						createBaseVNode("td", _hoisted_17$5, [createBaseVNode("span", _hoisted_18$5, toDisplayString(c.tickets_count || 0) + " طلبات ", 1)]),
						createBaseVNode("td", _hoisted_19$5, toDisplayString(c.notes || "—"), 1),
						createBaseVNode("td", _hoisted_20$5, [createBaseVNode("div", _hoisted_21$5, [
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => openHistoryModal(c),
								class: "px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
							}, [createVNode(unref(History), { class: "w-3.5 h-3.5" }), _cache[13] || (_cache[13] = createTextVNode(" سجل الأجهزة والضمان ", -1))], 8, _hoisted_22$5),
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => openWhatsAppChat(c.phone, c.name),
								class: "p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 cursor-pointer",
								title: "مراسلة واتساب"
							}, [createVNode(unref(MessageCircle), { class: "w-4 h-4" })], 8, _hoisted_23$5),
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => openEditModal(c),
								class: "p-1.5 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
							}, [createVNode(unref(PenLine), { class: "w-4 h-4" })], 8, _hoisted_24$5),
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => handleDeleteCustomer(c),
								class: "p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
							}, [createVNode(unref(Trash2), { class: "w-4 h-4" })], 8, _hoisted_25$5)
						])])
					]);
				}), 128))])])]),
				modalOpen.value ? (openBlock(), createElementBlock("div", _hoisted_26$5, [createBaseVNode("div", _hoisted_27$4, [createBaseVNode("div", _hoisted_28$4, [createBaseVNode("h3", _hoisted_29$4, toDisplayString(form.value.id ? "تعديل بيانات العميل" : "إضافة عميل جديد"), 1), createBaseVNode("button", {
					onClick: _cache[1] || (_cache[1] = ($event) => modalOpen.value = false),
					class: "cursor-pointer"
				}, [createVNode(unref(X), { class: "w-4 h-4" })])]), createBaseVNode("form", {
					onSubmit: withModifiers(handleSaveCustomer, ["prevent"]),
					class: "p-6 space-y-3 text-xs"
				}, [
					createBaseVNode("div", null, [_cache[15] || (_cache[15] = createBaseVNode("label", { class: "block font-bold mb-1" }, "اسم العميل *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.name = $event),
						required: "",
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.name]])]),
					createBaseVNode("div", _hoisted_30$4, [createBaseVNode("div", null, [_cache[16] || (_cache[16] = createBaseVNode("label", { class: "block font-bold mb-1" }, "رقم الهاتف الأساسي *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.phone = $event),
						required: "",
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
					}, null, 512), [[vModelText, form.value.phone]])]), createBaseVNode("div", null, [_cache[17] || (_cache[17] = createBaseVNode("label", { class: "block font-bold mb-1" }, "رقم هاتف إضافي", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.phone2 = $event),
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
					}, null, 512), [[vModelText, form.value.phone2]])])]),
					createBaseVNode("div", null, [_cache[18] || (_cache[18] = createBaseVNode("label", { class: "block font-bold mb-1" }, "المنطقة", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.value.area = $event),
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.area]])]),
					createBaseVNode("div", null, [_cache[19] || (_cache[19] = createBaseVNode("label", { class: "block font-bold mb-1" }, "العنوان التفصيلي", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.value.address = $event),
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.address]])]),
					createBaseVNode("div", null, [_cache[20] || (_cache[20] = createBaseVNode("label", { class: "block font-bold mb-1" }, "ملاحظات", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.value.notes = $event),
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.notes]])]),
					createBaseVNode("div", _hoisted_31$4, [createBaseVNode("button", {
						type: "button",
						onClick: _cache[8] || (_cache[8] = ($event) => modalOpen.value = false),
						class: "px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
					}, " إلغاء "), _cache[21] || (_cache[21] = createBaseVNode("button", {
						type: "submit",
						class: "px-5 py-2 rounded-xl bg-blue-600 text-white font-bold cursor-pointer"
					}, " حفظ العميل ", -1))])
				], 32)])])) : createCommentVNode("", true),
				historyModalOpen.value && selectedCustomer.value ? (openBlock(), createElementBlock("div", _hoisted_32$4, [createBaseVNode("div", _hoisted_33$4, [createBaseVNode("div", _hoisted_34$4, [createBaseVNode("h3", _hoisted_35$4, " السجل التاريخي لأجهزة وصيانات العميل: " + toDisplayString(selectedCustomer.value.name) + " (" + toDisplayString(selectedCustomer.value.phone) + ") ", 1), createBaseVNode("button", {
					onClick: _cache[9] || (_cache[9] = ($event) => historyModalOpen.value = false),
					class: "cursor-pointer"
				}, [createVNode(unref(X), { class: "w-5 h-5" })])]), createBaseVNode("div", _hoisted_36$3, [createBaseVNode("div", null, [_cache[22] || (_cache[22] = createBaseVNode("h4", { class: "font-black text-blue-600 mb-2" }, "🔌 الأجهزة المسجلة باسم العميل", -1)), createBaseVNode("div", _hoisted_37$3, [(openBlock(true), createElementBlock(Fragment, null, renderList(customerAppliances.value, (app) => {
					return openBlock(), createElementBlock("div", {
						key: app.id,
						class: "p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
					}, [
						createBaseVNode("div", _hoisted_38$2, toDisplayString(app.appliance_type) + " — " + toDisplayString(app.brand), 1),
						createBaseVNode("div", _hoisted_39$2, " الموديل: " + toDisplayString(app.model || "—") + " | السيريال: " + toDisplayString(app.serial_number || "—"), 1),
						app.last_warranty_end ? (openBlock(), createElementBlock("div", _hoisted_40$2, " 🛡️ آخر ضمان مسجل ينتهي في: " + toDisplayString(app.last_warranty_end) + " (طلب " + toDisplayString(app.last_ticket_number) + ") ", 1)) : createCommentVNode("", true)
					]);
				}), 128)), customerAppliances.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_41$2, " لا توجد أجهزة مسجلة بعد ")) : createCommentVNode("", true)])]), createBaseVNode("div", null, [_cache[24] || (_cache[24] = createBaseVNode("h4", { class: "font-black text-indigo-600 mb-2" }, "📋 سجل بلاغات الصيانة السابقة", -1)), createBaseVNode("div", _hoisted_42$2, [(openBlock(true), createElementBlock(Fragment, null, renderList(customerTickets.value, (t) => {
					return openBlock(), createElementBlock("div", {
						key: t.id,
						class: "p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between"
					}, [createBaseVNode("div", null, [
						createBaseVNode("div", _hoisted_43$2, [createBaseVNode("span", _hoisted_44$2, toDisplayString(t.ticket_number), 1), createTextVNode(" — " + toDisplayString(t.appliance_type) + " (" + toDisplayString(t.brand) + ") ", 1)]),
						createBaseVNode("div", _hoisted_45$2, "الشكوى: " + toDisplayString(t.complaint), 1),
						t.diagnosis ? (openBlock(), createElementBlock("div", _hoisted_46$2, " الإصلاح: " + toDisplayString(t.diagnosis), 1)) : createCommentVNode("", true)
					]), createBaseVNode("div", _hoisted_47$2, [createBaseVNode("div", _hoisted_48$2, toDisplayString(t.total_amount) + " ج.م", 1), createBaseVNode("button", {
						type: "button",
						onClick: ($event) => unref(appStore).openPrintModal(t, "invoice_warranty"),
						class: "px-2.5 py-1 rounded bg-blue-100 text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
					}, [createVNode(unref(Printer), { class: "w-3.5 h-3.5" }), _cache[23] || (_cache[23] = createTextVNode(" طباعة ", -1))], 8, _hoisted_49$2)])]);
				}), 128))])])])])])) : createCommentVNode("", true)
			]);
		};
	}
});
// src/renderer/src/views/TechniciansView.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$4 = { class: "space-y-5" };
var _hoisted_2$4 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4" };
var _hoisted_3$4 = { class: "text-xl font-black text-slate-900 dark:text-white flex items-center gap-2" };
var _hoisted_4$4 = { class: "grid grid-cols-1 md:grid-cols-3 gap-5" };
var _hoisted_5$4 = { class: "flex items-start justify-between" };
var _hoisted_6$4 = { class: "font-black text-base text-slate-900 dark:text-white" };
var _hoisted_7$4 = { class: "text-xs text-blue-600 dark:text-blue-400 font-bold mt-0.5" };
var _hoisted_8$4 = { class: "text-xs text-slate-500 font-mono mt-0.5" };
var _hoisted_9$4 = { class: "grid grid-cols-2 gap-2.5 mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs" };
var _hoisted_10$4 = { class: "font-black text-sm text-indigo-600 dark:text-indigo-400" };
var _hoisted_11$4 = { class: "font-black text-sm text-amber-600" };
var _hoisted_12$4 = { class: "font-black text-sm" };
var _hoisted_13$4 = { class: "font-black text-sm" };
var _hoisted_14$4 = { class: "mt-3 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs space-y-1" };
var _hoisted_15$4 = { class: "flex justify-between" };
var _hoisted_16$4 = { class: "font-bold" };
var _hoisted_17$4 = { class: "flex justify-between" };
var _hoisted_18$4 = { class: "font-bold" };
var _hoisted_19$4 = { class: "flex justify-between border-t border-emerald-200 dark:border-emerald-800 pt-1 font-black text-emerald-800 dark:text-emerald-300" };
var _hoisted_20$4 = { class: "flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 text-xs" };
var _hoisted_21$4 = ["onClick"];
var _hoisted_22$4 = { class: "flex items-center gap-1.5" };
var _hoisted_23$4 = ["onClick"];
var _hoisted_24$4 = ["onClick"];
var _hoisted_25$4 = {
	key: 0,
	class: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
};
var _hoisted_26$4 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" };
var _hoisted_27$3 = { class: "px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" };
var _hoisted_28$3 = { class: "font-bold text-sm" };
var _hoisted_29$3 = { class: "grid grid-cols-2 gap-3" };
var _hoisted_30$3 = { class: "flex justify-end gap-2 pt-3" };
var _hoisted_31$3 = {
	key: 1,
	class: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
};
var _hoisted_32$3 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-xs" };
var _hoisted_33$3 = { class: "px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" };
var _hoisted_34$3 = { class: "font-bold text-sm" };
var _hoisted_35$3 = { class: "flex justify-end gap-2 pt-2" };
// src/renderer/src/views/TechniciansView.vue
var TechniciansView_default = /* @__PURE__ */ defineComponent({
	__name: "TechniciansView",
	setup(__props) {
		const technicians = /* @__PURE__ */ ref([]);
		const modalOpen = /* @__PURE__ */ ref(false);
		const payoutModalOpen = /* @__PURE__ */ ref(false);
		const selectedTech = /* @__PURE__ */ ref(null);
		const payoutAmount = /* @__PURE__ */ ref(0);
		const payoutNotes = /* @__PURE__ */ ref("");
		const form = /* @__PURE__ */ ref({
			name: "",
			phone: "",
			specialty: "غسالات أوتوماتيك وفوق أوتوماتيك",
			commission_rate: 30,
			base_salary: 0,
			is_active: 1,
			notes: ""
		});
		async function loadTechnicians() {
			technicians.value = await window.api.listTechnicians();
		}
		function openCreateModal() {
			form.value = {
				name: "",
				phone: "",
				specialty: "غسالات أوتوماتيك وفوق أوتوماتيك",
				commission_rate: 30,
				base_salary: 0,
				is_active: 1,
				notes: ""
			};
			modalOpen.value = true;
		}
		function openEditModal(t) {
			form.value = { ...t };
			modalOpen.value = true;
		}
		function openPayoutModal(t) {
			selectedTech.value = t;
			const due = Math.max(0, (t.total_earned_commission || 0) - (t.total_paid_commission || 0));
			payoutAmount.value = Math.round(due);
			payoutNotes.value = `صرف عمولة صيانة للفني: ${t.name}`;
			payoutModalOpen.value = true;
		}
		async function handleSaveTechnician() {
			if (!form.value.name?.trim() || !form.value.phone?.trim()) {
				alert("يرجى إدخال اسم الفني ورقم الهاتف");
				return;
			}
			await window.api.saveTechnician(form.value);
			modalOpen.value = false;
			await loadTechnicians();
		}
		async function handleConfirmPayout() {
			if (!selectedTech.value || payoutAmount.value <= 0) return;
			await window.api.addTreasuryTransaction({
				transaction_type: "tech_commission",
				category: "عمولات ويوميات فنيين",
				amount: payoutAmount.value,
				technician_id: selectedTech.value.id,
				payment_method: "cash",
				description: payoutNotes.value || `صرف مستحقات الفني ${selectedTech.value.name}`
			});
			payoutModalOpen.value = false;
			await loadTechnicians();
		}
		async function handleDeleteTechnician(t) {
			if (!confirm(`هل أنت متأكد من حذف الفني "${t.name}"؟`)) return;
			await window.api.deleteTechnician(t.id);
			await loadTechnicians();
		}
		onMounted(loadTechnicians);
		return (_ctx, _cache) => {
			return openBlock(), createElementBlock("div", _hoisted_1$4, [
				createBaseVNode("div", _hoisted_2$4, [createBaseVNode("div", null, [createBaseVNode("h1", _hoisted_3$4, [createVNode(unref(UserCog), { class: "w-5 h-5 text-blue-600" }), _cache[12] || (_cache[12] = createTextVNode(" إدارة الفنيين، خطوط السير، ونسب العمولات ", -1))]), _cache[13] || (_cache[13] = createBaseVNode("p", { class: "text-xs text-slate-500 dark:text-slate-400 mt-0.5" }, " متابعة الطلبات المفتوحة مع كل فني، عهدة قطع الغيار، وحساب وصرف نسب العمولات تلقائياً ", -1))]), createBaseVNode("button", {
					type: "button",
					onClick: openCreateModal,
					class: "flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md cursor-pointer"
				}, [createVNode(unref(UserPlus), { class: "w-4 h-4" }), _cache[14] || (_cache[14] = createTextVNode(" إضافة فني جديد ", -1))])]),
				createBaseVNode("div", _hoisted_4$4, [(openBlock(true), createElementBlock(Fragment, null, renderList(technicians.value, (tech) => {
					return openBlock(), createElementBlock("div", {
						key: tech.id,
						class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4"
					}, [createBaseVNode("div", null, [
						createBaseVNode("div", _hoisted_5$4, [createBaseVNode("div", null, [
							createBaseVNode("h3", _hoisted_6$4, toDisplayString(tech.name), 1),
							createBaseVNode("p", _hoisted_7$4, toDisplayString(tech.specialty), 1),
							createBaseVNode("p", _hoisted_8$4, "📞 " + toDisplayString(tech.phone), 1)
						]), createBaseVNode("span", { class: normalizeClass(["px-2.5 py-1 rounded-full text-[11px] font-bold", tech.is_active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-100 text-rose-800"]) }, toDisplayString(tech.is_active ? "متاح بالعمل" : "موقوف"), 3)]),
						createBaseVNode("div", _hoisted_9$4, [
							createBaseVNode("div", null, [_cache[15] || (_cache[15] = createBaseVNode("span", { class: "text-slate-500 block" }, "طلبات جارية", -1)), createBaseVNode("span", _hoisted_10$4, toDisplayString(tech.active_tickets_count || 0) + " طلب ", 1)]),
							createBaseVNode("div", null, [_cache[16] || (_cache[16] = createBaseVNode("span", { class: "text-slate-500 block" }, "عهدة قطع غيار", -1)), createBaseVNode("span", _hoisted_11$4, toDisplayString(tech.custody_parts_count || 0) + " قطعة ", 1)]),
							createBaseVNode("div", null, [_cache[17] || (_cache[17] = createBaseVNode("span", { class: "text-slate-500 block" }, "نسبة العمولة", -1)), createBaseVNode("span", _hoisted_12$4, toDisplayString(tech.commission_rate) + "%", 1)]),
							createBaseVNode("div", null, [_cache[18] || (_cache[18] = createBaseVNode("span", { class: "text-slate-500 block" }, "الراتب الأساسي", -1)), createBaseVNode("span", _hoisted_13$4, toDisplayString(tech.base_salary) + " ج.م", 1)])
						]),
						createBaseVNode("div", _hoisted_14$4, [
							createBaseVNode("div", _hoisted_15$4, [_cache[19] || (_cache[19] = createBaseVNode("span", null, "إجمالي العمولات المستحقة:", -1)), createBaseVNode("span", _hoisted_16$4, toDisplayString(Math.round(tech.total_earned_commission || 0)) + " ج.م", 1)]),
							createBaseVNode("div", _hoisted_17$4, [_cache[20] || (_cache[20] = createBaseVNode("span", null, "تم صرفه للفني:", -1)), createBaseVNode("span", _hoisted_18$4, toDisplayString(Math.round(tech.total_paid_commission || 0)) + " ج.م", 1)]),
							createBaseVNode("div", _hoisted_19$4, [_cache[21] || (_cache[21] = createBaseVNode("span", null, "الرصيد المتبقي للفني:", -1)), createBaseVNode("span", null, toDisplayString(Math.max(0, Math.round((tech.total_earned_commission || 0) - (tech.total_paid_commission || 0)))) + " ج.م ", 1)])
						])
					]), createBaseVNode("div", _hoisted_20$4, [createBaseVNode("button", {
						type: "button",
						onClick: ($event) => openPayoutModal(tech),
						class: "flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
					}, [createVNode(unref(Wallet), { class: "w-3.5 h-3.5" }), _cache[22] || (_cache[22] = createTextVNode(" صرف عمولة / دفعة ", -1))], 8, _hoisted_21$4), createBaseVNode("div", _hoisted_22$4, [createBaseVNode("button", {
						type: "button",
						onClick: ($event) => openEditModal(tech),
						class: "p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
					}, [createVNode(unref(PenLine), { class: "w-4 h-4" })], 8, _hoisted_23$4), createBaseVNode("button", {
						type: "button",
						onClick: ($event) => handleDeleteTechnician(tech),
						class: "p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
					}, [createVNode(unref(Trash2), { class: "w-4 h-4" })], 8, _hoisted_24$4)])])]);
				}), 128))]),
				modalOpen.value ? (openBlock(), createElementBlock("div", _hoisted_25$4, [createBaseVNode("div", _hoisted_26$4, [createBaseVNode("div", _hoisted_27$3, [createBaseVNode("h3", _hoisted_28$3, toDisplayString(form.value.id ? "تعديل بيانات الفني" : "إضافة فني صيانة جديد"), 1), createBaseVNode("button", {
					onClick: _cache[0] || (_cache[0] = ($event) => modalOpen.value = false),
					class: "cursor-pointer"
				}, [createVNode(unref(X), { class: "w-4 h-4" })])]), createBaseVNode("form", {
					onSubmit: withModifiers(handleSaveTechnician, ["prevent"]),
					class: "p-6 space-y-3 text-xs"
				}, [
					createBaseVNode("div", null, [_cache[23] || (_cache[23] = createBaseVNode("label", { class: "block font-bold mb-1" }, "اسم الفني / المهندس *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.name = $event),
						required: "",
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.name]])]),
					createBaseVNode("div", null, [_cache[24] || (_cache[24] = createBaseVNode("label", { class: "block font-bold mb-1" }, "رقم الموبايل *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.phone = $event),
						required: "",
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
					}, null, 512), [[vModelText, form.value.phone]])]),
					createBaseVNode("div", null, [_cache[25] || (_cache[25] = createBaseVNode("label", { class: "block font-bold mb-1" }, "التخصص الفني", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.specialty = $event),
						type: "text",
						placeholder: "مثال: غسالات أوتوماتيك / ثلاجات وتكييف / كروت إلكترونية",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.specialty]])]),
					createBaseVNode("div", _hoisted_29$3, [createBaseVNode("div", null, [_cache[26] || (_cache[26] = createBaseVNode("label", { class: "block font-bold mb-1" }, "نسبة العمولة من المصنعية (%)", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.commission_rate = $event),
						type: "number",
						min: "0",
						max: "100",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, null, 512), [[
						vModelText,
						form.value.commission_rate,
						void 0,
						{ number: true }
					]])]), createBaseVNode("div", null, [_cache[27] || (_cache[27] = createBaseVNode("label", { class: "block font-bold mb-1" }, "الراتب الأساسي الثابت (ج.م)", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.value.base_salary = $event),
						type: "number",
						min: "0",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, null, 512), [[
						vModelText,
						form.value.base_salary,
						void 0,
						{ number: true }
					]])])]),
					createBaseVNode("div", null, [_cache[29] || (_cache[29] = createBaseVNode("label", { class: "block font-bold mb-1" }, "الحالة", -1)), withDirectives(createBaseVNode("select", {
						"onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.value.is_active = $event),
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, [..._cache[28] || (_cache[28] = [createBaseVNode("option", { value: 1 }, "نشط بالعمل", -1), createBaseVNode("option", { value: 0 }, "موقوف / إجازة", -1)])], 512), [[vModelSelect, form.value.is_active]])]),
					createBaseVNode("div", _hoisted_30$3, [createBaseVNode("button", {
						type: "button",
						onClick: _cache[7] || (_cache[7] = ($event) => modalOpen.value = false),
						class: "px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
					}, " إلغاء "), _cache[30] || (_cache[30] = createBaseVNode("button", {
						type: "submit",
						class: "px-5 py-2 rounded-xl bg-blue-600 text-white font-bold cursor-pointer"
					}, " حفظ الفني ", -1))])
				], 32)])])) : createCommentVNode("", true),
				payoutModalOpen.value && selectedTech.value ? (openBlock(), createElementBlock("div", _hoisted_31$3, [createBaseVNode("div", _hoisted_32$3, [createBaseVNode("div", _hoisted_33$3, [createBaseVNode("h3", _hoisted_34$3, "صرف عمولة / سلفة للفني: " + toDisplayString(selectedTech.value.name), 1), createBaseVNode("button", {
					onClick: _cache[8] || (_cache[8] = ($event) => payoutModalOpen.value = false),
					class: "cursor-pointer"
				}, [createVNode(unref(X), { class: "w-4 h-4" })])]), createBaseVNode("form", {
					onSubmit: withModifiers(handleConfirmPayout, ["prevent"]),
					class: "p-6 space-y-4"
				}, [
					createBaseVNode("div", null, [_cache[31] || (_cache[31] = createBaseVNode("label", { class: "block font-bold mb-1" }, "المبلغ المنصرف من الخزينة (ج.م) *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => payoutAmount.value = $event),
						type: "number",
						min: "1",
						required: "",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-black text-base"
					}, null, 512), [[
						vModelText,
						payoutAmount.value,
						void 0,
						{ number: true }
					]])]),
					createBaseVNode("div", null, [_cache[32] || (_cache[32] = createBaseVNode("label", { class: "block font-bold mb-1" }, "البيان", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => payoutNotes.value = $event),
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, payoutNotes.value]])]),
					createBaseVNode("div", _hoisted_35$3, [createBaseVNode("button", {
						type: "button",
						onClick: _cache[11] || (_cache[11] = ($event) => payoutModalOpen.value = false),
						class: "px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
					}, " إلغاء "), _cache[33] || (_cache[33] = createBaseVNode("button", {
						type: "submit",
						class: "px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold cursor-pointer"
					}, " تأكيد الصرف وتسجيله بالخزينة ", -1))])
				], 32)])])) : createCommentVNode("", true)
			]);
		};
	}
});
// src/renderer/src/views/InventoryView.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$3 = { class: "space-y-5" };
var _hoisted_2$3 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4" };
var _hoisted_3$3 = { class: "text-xl font-black text-slate-900 dark:text-white flex items-center gap-2" };
var _hoisted_4$3 = { class: "flex flex-wrap items-center gap-3" };
var _hoisted_5$3 = { class: "flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold" };
var _hoisted_6$3 = {
	key: 0,
	class: "relative max-w-md text-xs"
};
var _hoisted_7$3 = {
	key: 1,
	class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
};
var _hoisted_8$3 = { class: "w-full text-right text-xs" };
var _hoisted_9$3 = { class: "divide-y divide-slate-200 dark:divide-slate-800" };
var _hoisted_10$3 = { class: "py-3.5 px-4 font-mono font-bold text-blue-600 dark:text-blue-400" };
var _hoisted_11$3 = { class: "py-3.5 px-4 font-bold text-slate-900 dark:text-white text-sm" };
var _hoisted_12$3 = { class: "py-3.5 px-4" };
var _hoisted_13$3 = { class: "font-bold" };
var _hoisted_14$3 = { class: "text-slate-500" };
var _hoisted_15$3 = { class: "py-3.5 px-4 font-semibold" };
var _hoisted_16$3 = { class: "py-3.5 px-4 font-black text-emerald-600 dark:text-emerald-400" };
var _hoisted_17$3 = { class: "py-3.5 px-4" };
var _hoisted_18$3 = { class: "py-3.5 px-4 text-slate-500" };
var _hoisted_19$3 = { class: "py-3.5 px-4" };
var _hoisted_20$3 = { class: "flex items-center gap-1.5" };
var _hoisted_21$3 = ["onClick"];
var _hoisted_22$3 = ["onClick"];
var _hoisted_23$3 = ["onClick"];
var _hoisted_24$3 = ["onClick"];
var _hoisted_25$3 = {
	key: 2,
	class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
};
var _hoisted_26$3 = { class: "w-full text-right text-xs" };
var _hoisted_27$2 = { class: "divide-y divide-slate-200 dark:divide-slate-800" };
var _hoisted_28$2 = { class: "py-3 px-4 font-mono text-slate-500" };
var _hoisted_29$2 = { class: "py-3 px-4 font-bold" };
var _hoisted_30$2 = { class: "py-3 px-4" };
var _hoisted_31$2 = { class: "py-3 px-4 font-black" };
var _hoisted_32$2 = { class: "py-3 px-4 font-semibold" };
var _hoisted_33$2 = { class: "py-3 px-4 text-slate-500" };
var _hoisted_34$2 = { key: 0 };
var _hoisted_35$2 = {
	key: 3,
	class: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
};
var _hoisted_36$2 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden text-xs" };
var _hoisted_37$2 = { class: "px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" };
var _hoisted_38$1 = { class: "font-bold text-sm" };
var _hoisted_39$1 = { class: "grid grid-cols-2 gap-3" };
var _hoisted_40$1 = ["value"];
var _hoisted_41$1 = { class: "grid grid-cols-2 gap-3" };
var _hoisted_42$1 = { class: "grid grid-cols-4 gap-3" };
var _hoisted_43$1 = { class: "flex justify-end gap-2 pt-3" };
var _hoisted_44$1 = {
	key: 4,
	class: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
};
var _hoisted_45$1 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-xs" };
var _hoisted_46$1 = { class: "px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" };
var _hoisted_47$1 = { key: 0 };
var _hoisted_48$1 = ["value"];
var _hoisted_49$1 = {
	key: 1,
	class: "flex items-center gap-2 pt-1"
};
var _hoisted_50 = { class: "flex justify-end gap-2 pt-3" };
// src/renderer/src/views/InventoryView.vue
var InventoryView_default = /* @__PURE__ */ defineComponent({
	__name: "InventoryView",
	setup(__props) {
		const parts = /* @__PURE__ */ ref([]);
		const movements = /* @__PURE__ */ ref([]);
		const technicians = /* @__PURE__ */ ref([]);
		const searchQuery = /* @__PURE__ */ ref("");
		const activeTab = /* @__PURE__ */ ref("parts");
		const partModalOpen = /* @__PURE__ */ ref(false);
		const moveModalOpen = /* @__PURE__ */ ref(false);
		const partForm = /* @__PURE__ */ ref({
			code: "",
			name: "",
			category: PART_CATEGORIES[0],
			brand: "عام",
			purchase_price: 0,
			selling_price: 0,
			quantity: 5,
			min_quantity: 3,
			location: "",
			notes: ""
		});
		const moveForm = /* @__PURE__ */ ref({
			part_id: 0,
			technician_id: null,
			movement_type: "in",
			quantity: 1,
			notes: "",
			recordInTreasury: true
		});
		async function loadData() {
			const [pList, mList, tList] = await Promise.all([
				window.api.listSpareParts(searchQuery.value),
				window.api.listInventoryMovements(),
				window.api.listTechnicians()
			]);
			parts.value = pList;
			movements.value = mList;
			technicians.value = tList;
		}
		watch(searchQuery, () => {
			loadData();
		});
		function openCreatePartModal() {
			partForm.value = {
				code: `PT-${Math.floor(1e3 + Math.random() * 9e3)}`,
				name: "",
				category: PART_CATEGORIES[0],
				brand: "عام",
				purchase_price: 0,
				selling_price: 0,
				quantity: 5,
				min_quantity: 3,
				location: "",
				notes: ""
			};
			partModalOpen.value = true;
		}
		function openEditPartModal(p) {
			partForm.value = { ...p };
			partModalOpen.value = true;
		}
		function openMovementModal(p, type = "in") {
			moveForm.value = {
				part_id: p.id,
				technician_id: technicians.value[0]?.id || null,
				movement_type: type,
				quantity: 1,
				notes: "",
				recordInTreasury: type === "in"
			};
			moveModalOpen.value = true;
		}
		async function handleSavePart() {
			if (!partForm.value.name?.trim()) {
				alert("يرجى إدخال اسم قطعة الغيار");
				return;
			}
			await window.api.saveSparePart(partForm.value);
			partModalOpen.value = false;
			await loadData();
		}
		async function handleRecordMovement() {
			try {
				await window.api.recordInventoryMovement(moveForm.value);
				moveModalOpen.value = false;
				await loadData();
			} catch (err) {
				alert(err instanceof Error ? err.message : "تعذر تسجيل حركة المخزن");
			}
		}
		async function handleDeletePart(p) {
			if (!confirm(`هل أنت متأكد من حذف الصنف "${p.name}"؟`)) return;
			try {
				await window.api.deleteSparePart(p.id);
				await loadData();
			} catch {
				alert("لا يمكن حذف قطعة غيار مستخدمة في طلبات صيانة سابقة");
			}
		}
		const movementTypeLabels = {
			in: {
				label: "توريد وشراء للمخزن (+)",
				badge: "bg-emerald-100 text-emerald-800"
			},
			custody_issue: {
				label: "صرف عهدة لفني (-)",
				badge: "bg-amber-100 text-amber-800"
			},
			custody_return: {
				label: "مرتجع عهدة من فني (+)",
				badge: "bg-blue-100 text-blue-800"
			},
			damaged: {
				label: "تالف / هالك (-)",
				badge: "bg-rose-100 text-rose-800"
			},
			out_ticket: {
				label: "منصرف لطلب صيانة (-)",
				badge: "bg-indigo-100 text-indigo-800"
			}
		};
		onMounted(loadData);
		return (_ctx, _cache) => {
			return openBlock(), createElementBlock("div", _hoisted_1$3, [
				createBaseVNode("div", _hoisted_2$3, [createBaseVNode("div", null, [createBaseVNode("h1", _hoisted_3$3, [createVNode(unref(Package), { class: "w-5 h-5 text-blue-600" }), _cache[21] || (_cache[21] = createTextVNode(" مخزن قطع الغيار وعهدة الفنيين ", -1))]), _cache[22] || (_cache[22] = createBaseVNode("p", { class: "text-xs text-slate-500 dark:text-slate-400 mt-0.5" }, " إدارة أرصدة قطع الغيار، أسعار الشراء والبيع، تنبيهات النواقص، وصرف واستلام عهدة الفنيين ", -1))]), createBaseVNode("div", _hoisted_4$3, [createBaseVNode("div", _hoisted_5$3, [createBaseVNode("button", {
					type: "button",
					onClick: _cache[0] || (_cache[0] = ($event) => activeTab.value = "parts"),
					class: normalizeClass(["px-3.5 py-1.5 rounded-lg transition cursor-pointer", activeTab.value === "parts" ? "bg-blue-600 text-white" : "text-slate-600 dark:text-slate-300"])
				}, " أصناف المخزن (" + toDisplayString(parts.value.length) + ") ", 3), createBaseVNode("button", {
					type: "button",
					onClick: _cache[1] || (_cache[1] = ($event) => activeTab.value = "movements"),
					class: normalizeClass(["px-3.5 py-1.5 rounded-lg transition cursor-pointer", activeTab.value === "movements" ? "bg-blue-600 text-white" : "text-slate-600 dark:text-slate-300"])
				}, " سجل حركات الصرف والتوريد ", 2)]), createBaseVNode("button", {
					type: "button",
					onClick: openCreatePartModal,
					class: "flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md cursor-pointer"
				}, [createVNode(unref(CirclePlus), { class: "w-4 h-4" }), _cache[23] || (_cache[23] = createTextVNode(" إضافة قطعة غيار جديدة ", -1))])])]),
				activeTab.value === "parts" ? (openBlock(), createElementBlock("div", _hoisted_6$3, [createVNode(unref(Search), { class: "w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" }), withDirectives(createBaseVNode("input", {
					"onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => searchQuery.value = $event),
					type: "text",
					placeholder: "بحث بكود القطعة، الاسم، التصنيف، أو الماركة...",
					class: "w-full pr-10 pl-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
				}, null, 512), [[vModelText, searchQuery.value]])])) : createCommentVNode("", true),
				activeTab.value === "parts" ? (openBlock(), createElementBlock("div", _hoisted_7$3, [createBaseVNode("table", _hoisted_8$3, [_cache[26] || (_cache[26] = createBaseVNode("thead", { class: "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold" }, [createBaseVNode("tr", null, [
					createBaseVNode("th", { class: "py-3.5 px-4" }, "الكود"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "اسم قطعة الغيار"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "التصنيف والماركة"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "سعر الشراء"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "سعر البيع للعميل"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "الرصيد المتاح"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "المكان"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "حركات المخزن والإجراءات")
				])], -1)), createBaseVNode("tbody", _hoisted_9$3, [(openBlock(true), createElementBlock(Fragment, null, renderList(parts.value, (p) => {
					return openBlock(), createElementBlock("tr", {
						key: p.id,
						class: "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
					}, [
						createBaseVNode("td", _hoisted_10$3, toDisplayString(p.code), 1),
						createBaseVNode("td", _hoisted_11$3, toDisplayString(p.name), 1),
						createBaseVNode("td", _hoisted_12$3, [createBaseVNode("div", _hoisted_13$3, toDisplayString(p.category), 1), createBaseVNode("div", _hoisted_14$3, toDisplayString(p.brand), 1)]),
						createBaseVNode("td", _hoisted_15$3, toDisplayString(p.purchase_price) + " ج.م", 1),
						createBaseVNode("td", _hoisted_16$3, toDisplayString(p.selling_price) + " ج.م ", 1),
						createBaseVNode("td", _hoisted_17$3, [createBaseVNode("span", { class: normalizeClass(["inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-black", p.quantity <= p.min_quantity ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"]) }, [p.quantity <= p.min_quantity ? (openBlock(), createBlock(unref(TriangleAlert), {
							key: 0,
							class: "w-3.5 h-3.5"
						})) : createCommentVNode("", true), createTextVNode(" " + toDisplayString(p.quantity) + " قطعة ", 1)], 2)]),
						createBaseVNode("td", _hoisted_18$3, toDisplayString(p.location || "—"), 1),
						createBaseVNode("td", _hoisted_19$3, [createBaseVNode("div", _hoisted_20$3, [
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => openMovementModal(p, "in"),
								class: "px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer",
								title: "توريد كمية للمخزن"
							}, [createVNode(unref(ArrowDownLeft), { class: "w-3.5 h-3.5" }), _cache[24] || (_cache[24] = createTextVNode(" توريد ", -1))], 8, _hoisted_21$3),
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => openMovementModal(p, "custody_issue"),
								class: "px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold flex items-center gap-1 cursor-pointer",
								title: "صرف عهدة لفني"
							}, [createVNode(unref(ArrowUpRight), { class: "w-3.5 h-3.5" }), _cache[25] || (_cache[25] = createTextVNode(" عهدة فني ", -1))], 8, _hoisted_22$3),
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => openEditPartModal(p),
								class: "p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
							}, [createVNode(unref(PenLine), { class: "w-4 h-4" })], 8, _hoisted_23$3),
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => handleDeletePart(p),
								class: "p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
							}, [createVNode(unref(Trash2), { class: "w-4 h-4" })], 8, _hoisted_24$3)
						])])
					]);
				}), 128))])])])) : (openBlock(), createElementBlock("div", _hoisted_25$3, [createBaseVNode("table", _hoisted_26$3, [_cache[28] || (_cache[28] = createBaseVNode("thead", { class: "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold" }, [createBaseVNode("tr", null, [
					createBaseVNode("th", { class: "py-3.5 px-4" }, "التاريخ"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "قطعة الغيار"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "نوع الحركة"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "الكمية"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "الفني المرتبط"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "ملاحظات")
				])], -1)), createBaseVNode("tbody", _hoisted_27$2, [(openBlock(true), createElementBlock(Fragment, null, renderList(movements.value, (m) => {
					return openBlock(), createElementBlock("tr", { key: m.id }, [
						createBaseVNode("td", _hoisted_28$2, toDisplayString(m.created_at), 1),
						createBaseVNode("td", _hoisted_29$2, toDisplayString(m.part_name) + " (" + toDisplayString(m.part_code) + ")", 1),
						createBaseVNode("td", _hoisted_30$2, [createBaseVNode("span", { class: normalizeClass(["px-2.5 py-1 rounded-full font-bold text-[11px]", movementTypeLabels[m.movement_type]?.badge]) }, toDisplayString(movementTypeLabels[m.movement_type]?.label || m.movement_type), 3)]),
						createBaseVNode("td", _hoisted_31$2, toDisplayString(m.quantity), 1),
						createBaseVNode("td", _hoisted_32$2, toDisplayString(m.technician_name || "—"), 1),
						createBaseVNode("td", _hoisted_33$2, toDisplayString(m.notes || "—"), 1)
					]);
				}), 128)), movements.value.length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_34$2, [..._cache[27] || (_cache[27] = [createBaseVNode("td", {
					colspan: "6",
					class: "py-8 text-center text-slate-400"
				}, " لا توجد حركات مخزنية مسجلة بعد ", -1)])])) : createCommentVNode("", true)])])])),
				partModalOpen.value ? (openBlock(), createElementBlock("div", _hoisted_35$2, [createBaseVNode("div", _hoisted_36$2, [createBaseVNode("div", _hoisted_37$2, [createBaseVNode("h3", _hoisted_38$1, toDisplayString(partForm.value.id ? "تعديل بيانات قطعة الغيار" : "إضافة قطعة غيار جديدة للمخزن"), 1), createBaseVNode("button", {
					onClick: _cache[3] || (_cache[3] = ($event) => partModalOpen.value = false),
					class: "cursor-pointer"
				}, [createVNode(unref(X), { class: "w-4 h-4" })])]), createBaseVNode("form", {
					onSubmit: withModifiers(handleSavePart, ["prevent"]),
					class: "p-6 space-y-3"
				}, [
					createBaseVNode("div", _hoisted_39$1, [createBaseVNode("div", null, [_cache[29] || (_cache[29] = createBaseVNode("label", { class: "block font-bold mb-1" }, "كود القطعة *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => partForm.value.code = $event),
						required: "",
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
					}, null, 512), [[vModelText, partForm.value.code]])]), createBaseVNode("div", null, [_cache[30] || (_cache[30] = createBaseVNode("label", { class: "block font-bold mb-1" }, "التصنيف *", -1)), withDirectives(createBaseVNode("select", {
						"onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => partForm.value.category = $event),
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, [(openBlock(true), createElementBlock(Fragment, null, renderList(unref(PART_CATEGORIES), (c) => {
						return openBlock(), createElementBlock("option", {
							key: c,
							value: c
						}, toDisplayString(c), 9, _hoisted_40$1);
					}), 128))], 512), [[vModelSelect, partForm.value.category]])])]),
					createBaseVNode("div", null, [_cache[31] || (_cache[31] = createBaseVNode("label", { class: "block font-bold mb-1" }, "اسم وبيان قطعة الغيار *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => partForm.value.name = $event),
						required: "",
						type: "text",
						placeholder: "مثال: طلمبة طرد غسالة أوتوماتيك إل جي أصلية",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, null, 512), [[vModelText, partForm.value.name]])]),
					createBaseVNode("div", _hoisted_41$1, [createBaseVNode("div", null, [_cache[32] || (_cache[32] = createBaseVNode("label", { class: "block font-bold mb-1" }, "الماركة المتوافقة", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => partForm.value.brand = $event),
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, partForm.value.brand]])]), createBaseVNode("div", null, [_cache[33] || (_cache[33] = createBaseVNode("label", { class: "block font-bold mb-1" }, "مكان الرف بالمخزن", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => partForm.value.location = $event),
						type: "text",
						placeholder: "رف A1",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, partForm.value.location]])])]),
					createBaseVNode("div", _hoisted_42$1, [
						createBaseVNode("div", null, [_cache[34] || (_cache[34] = createBaseVNode("label", { class: "block font-bold mb-1" }, "سعر الشراء", -1)), withDirectives(createBaseVNode("input", {
							"onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => partForm.value.purchase_price = $event),
							type: "number",
							min: "0",
							class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
						}, null, 512), [[
							vModelText,
							partForm.value.purchase_price,
							void 0,
							{ number: true }
						]])]),
						createBaseVNode("div", null, [_cache[35] || (_cache[35] = createBaseVNode("label", { class: "block font-bold mb-1" }, "سعر البيع", -1)), withDirectives(createBaseVNode("input", {
							"onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => partForm.value.selling_price = $event),
							type: "number",
							min: "0",
							class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
						}, null, 512), [[
							vModelText,
							partForm.value.selling_price,
							void 0,
							{ number: true }
						]])]),
						createBaseVNode("div", null, [_cache[36] || (_cache[36] = createBaseVNode("label", { class: "block font-bold mb-1" }, "الكمية الحالية", -1)), withDirectives(createBaseVNode("input", {
							"onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => partForm.value.quantity = $event),
							type: "number",
							min: "0",
							class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
						}, null, 512), [[
							vModelText,
							partForm.value.quantity,
							void 0,
							{ number: true }
						]])]),
						createBaseVNode("div", null, [_cache[37] || (_cache[37] = createBaseVNode("label", { class: "block font-bold mb-1" }, "حد النواقص", -1)), withDirectives(createBaseVNode("input", {
							"onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => partForm.value.min_quantity = $event),
							type: "number",
							min: "0",
							class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
						}, null, 512), [[
							vModelText,
							partForm.value.min_quantity,
							void 0,
							{ number: true }
						]])])
					]),
					createBaseVNode("div", _hoisted_43$1, [createBaseVNode("button", {
						type: "button",
						onClick: _cache[13] || (_cache[13] = ($event) => partModalOpen.value = false),
						class: "px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
					}, " إلغاء "), _cache[38] || (_cache[38] = createBaseVNode("button", {
						type: "submit",
						class: "px-5 py-2 rounded-xl bg-blue-600 text-white font-bold cursor-pointer"
					}, " حفظ الصنف ", -1))])
				], 32)])])) : createCommentVNode("", true),
				moveModalOpen.value ? (openBlock(), createElementBlock("div", _hoisted_44$1, [createBaseVNode("div", _hoisted_45$1, [createBaseVNode("div", _hoisted_46$1, [_cache[39] || (_cache[39] = createBaseVNode("h3", { class: "font-bold text-sm" }, "تسجيل حركة مخزن / عهدة فني", -1)), createBaseVNode("button", {
					onClick: _cache[14] || (_cache[14] = ($event) => moveModalOpen.value = false),
					class: "cursor-pointer"
				}, [createVNode(unref(X), { class: "w-4 h-4" })])]), createBaseVNode("form", {
					onSubmit: withModifiers(handleRecordMovement, ["prevent"]),
					class: "p-6 space-y-3"
				}, [
					createBaseVNode("div", null, [_cache[41] || (_cache[41] = createBaseVNode("label", { class: "block font-bold mb-1" }, "نوع الحركة *", -1)), withDirectives(createBaseVNode("select", {
						"onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => moveForm.value.movement_type = $event),
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, [..._cache[40] || (_cache[40] = [
						createBaseVNode("option", { value: "in" }, "توريد وشراء جديد للمخزن (+)", -1),
						createBaseVNode("option", { value: "custody_issue" }, "صرف عهدة لفني (-)", -1),
						createBaseVNode("option", { value: "custody_return" }, "إرجاع عهدة سليمة من فني للمخزن (+)", -1),
						createBaseVNode("option", { value: "damaged" }, "تسجيل قطعة تالفة / مرتجع تالف (-)", -1)
					])], 512), [[vModelSelect, moveForm.value.movement_type]])]),
					moveForm.value.movement_type === "custody_issue" || moveForm.value.movement_type === "custody_return" ? (openBlock(), createElementBlock("div", _hoisted_47$1, [_cache[42] || (_cache[42] = createBaseVNode("label", { class: "block font-bold mb-1" }, "الفني المستلم / المسلم *", -1)), withDirectives(createBaseVNode("select", {
						"onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => moveForm.value.technician_id = $event),
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, [(openBlock(true), createElementBlock(Fragment, null, renderList(technicians.value, (t) => {
						return openBlock(), createElementBlock("option", {
							key: t.id,
							value: t.id
						}, toDisplayString(t.name), 9, _hoisted_48$1);
					}), 128))], 512), [[vModelSelect, moveForm.value.technician_id]])])) : createCommentVNode("", true),
					createBaseVNode("div", null, [_cache[43] || (_cache[43] = createBaseVNode("label", { class: "block font-bold mb-1" }, "الكمية *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => moveForm.value.quantity = $event),
						type: "number",
						min: "1",
						required: "",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, null, 512), [[
						vModelText,
						moveForm.value.quantity,
						void 0,
						{ number: true }
					]])]),
					moveForm.value.movement_type === "in" ? (openBlock(), createElementBlock("div", _hoisted_49$1, [withDirectives(createBaseVNode("input", {
						id: "recTreasury",
						"onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => moveForm.value.recordInTreasury = $event),
						type: "checkbox",
						class: "w-4 h-4"
					}, null, 512), [[vModelCheckbox, moveForm.value.recordInTreasury]]), _cache[44] || (_cache[44] = createBaseVNode("label", {
						for: "recTreasury",
						class: "font-bold"
					}, " تسجيل تكلفة الشراء كمصروف في الخزينة تلقائياً ", -1))])) : createCommentVNode("", true),
					createBaseVNode("div", null, [_cache[45] || (_cache[45] = createBaseVNode("label", { class: "block font-bold mb-1" }, "ملاحظات", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => moveForm.value.notes = $event),
						type: "text",
						placeholder: "اسم المورد أو سبب الصرف...",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, moveForm.value.notes]])]),
					createBaseVNode("div", _hoisted_50, [createBaseVNode("button", {
						type: "button",
						onClick: _cache[20] || (_cache[20] = ($event) => moveModalOpen.value = false),
						class: "px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
					}, " إلغاء "), _cache[46] || (_cache[46] = createBaseVNode("button", {
						type: "submit",
						class: "px-5 py-2 rounded-xl bg-blue-600 text-white font-bold cursor-pointer"
					}, " تنفيذ الحركة ", -1))])
				], 32)])])) : createCommentVNode("", true)
			]);
		};
	}
});
// src/renderer/src/views/TreasuryView.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$2 = { class: "space-y-5" };
var _hoisted_2$2 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4" };
var _hoisted_3$2 = { class: "text-xl font-black text-slate-900 dark:text-white flex items-center gap-2" };
var _hoisted_4$2 = { class: "flex items-center gap-2.5" };
var _hoisted_5$2 = {
	key: 0,
	class: "grid grid-cols-1 md:grid-cols-4 gap-4"
};
var _hoisted_6$2 = { class: "p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs" };
var _hoisted_7$2 = { class: "flex items-center justify-between text-xs font-bold text-slate-500" };
var _hoisted_8$2 = { class: "text-2xl font-black text-blue-600 dark:text-blue-400 mt-2" };
var _hoisted_9$2 = { class: "p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs" };
var _hoisted_10$2 = { class: "flex items-center justify-between text-xs font-bold text-slate-500" };
var _hoisted_11$2 = { class: "text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2" };
var _hoisted_12$2 = { class: "p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs" };
var _hoisted_13$2 = { class: "flex items-center justify-between text-xs font-bold text-slate-500" };
var _hoisted_14$2 = { class: "text-2xl font-black text-rose-600 dark:text-rose-400 mt-2" };
var _hoisted_15$2 = { class: "text-[11px] text-slate-500 mt-1" };
var _hoisted_16$2 = { class: "p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs" };
var _hoisted_17$2 = { class: "flex items-center justify-between text-xs font-bold text-slate-500" };
var _hoisted_18$2 = { class: "text-2xl font-black text-teal-600 dark:text-teal-400 mt-2" };
var _hoisted_19$2 = { class: "text-[11px] text-slate-500 mt-1" };
var _hoisted_20$2 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden" };
var _hoisted_21$2 = { class: "w-full text-right text-xs" };
var _hoisted_22$2 = { class: "divide-y divide-slate-200 dark:divide-slate-800" };
var _hoisted_23$2 = { class: "py-3 px-4 font-bold" };
var _hoisted_24$2 = { class: "py-3 px-4 font-mono text-slate-500" };
var _hoisted_25$2 = { class: "py-3 px-4" };
var _hoisted_26$2 = { class: "py-3 px-4 font-bold" };
var _hoisted_27$1 = { class: "py-3 px-4 font-semibold text-slate-800 dark:text-slate-200" };
var _hoisted_28$1 = { class: "py-3 px-4" };
var _hoisted_29$1 = { class: "py-3 px-4" };
var _hoisted_30$1 = ["onClick"];
var _hoisted_31$1 = {
	key: 1,
	class: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
};
var _hoisted_32$1 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-xs" };
var _hoisted_33$1 = { class: "px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" };
var _hoisted_34$1 = { class: "font-bold text-sm" };
var _hoisted_35$1 = { class: "grid grid-cols-2 gap-3" };
var _hoisted_36$1 = ["value"];
var _hoisted_37$1 = { class: "flex justify-end gap-2 pt-3" };
// src/renderer/src/views/TreasuryView.vue
var TreasuryView_default = /* @__PURE__ */ defineComponent({
	__name: "TreasuryView",
	setup(__props) {
		const transactions = /* @__PURE__ */ ref([]);
		const stats = /* @__PURE__ */ ref(null);
		const modalOpen = /* @__PURE__ */ ref(false);
		const form = /* @__PURE__ */ ref({
			transaction_type: "expense",
			category: "مصروفات إدارية وانتقالات",
			amount: 0,
			payment_method: "cash",
			description: ""
		});
		async function loadData() {
			const [tList, sData] = await Promise.all([window.api.listTreasuryTransactions(), window.api.getDashboardStats()]);
			transactions.value = tList;
			stats.value = sData;
		}
		const totalTreasuryBalance = computed(() => transactions.value.reduce((acc, row) => {
			if (row.transaction_type === "income") return acc + row.amount;
			return acc - row.amount;
		}, 0));
		function openAddModal(type) {
			form.value = {
				transaction_type: type,
				category: type === "income" ? "إيراد صيانة / مبيعات" : "مصروفات تشغيل وانتقالات",
				amount: 0,
				payment_method: "cash",
				description: ""
			};
			modalOpen.value = true;
		}
		async function handleSaveTransaction() {
			if (!form.value.amount || form.value.amount <= 0 || !form.value.description?.trim()) {
				alert("يرجى إدخال المبلغ والبيان");
				return;
			}
			await window.api.addTreasuryTransaction(form.value);
			modalOpen.value = false;
			await loadData();
		}
		async function handleDeleteTransaction(id) {
			if (!confirm("هل أنت متأكد من حذف هذه الحركة المالية؟")) return;
			await window.api.deleteTreasuryTransaction(id);
			await loadData();
		}
		onMounted(loadData);
		return (_ctx, _cache) => {
			return openBlock(), createElementBlock("div", _hoisted_1$2, [
				createBaseVNode("div", _hoisted_2$2, [createBaseVNode("div", null, [createBaseVNode("h1", _hoisted_3$2, [createVNode(unref(Wallet), { class: "w-5 h-5 text-emerald-600" }), _cache[8] || (_cache[8] = createTextVNode(" الخزينة والحسابات وصافي الأرباح ", -1))]), _cache[9] || (_cache[9] = createBaseVNode("p", { class: "text-xs text-slate-500 dark:text-slate-400 mt-0.5" }, " متابعة دقيقة لكل جنيه يدخل أو يخرج من المركز، مع فصل تكلفة قطع الغيار وعمولات الفنيين ", -1))]), createBaseVNode("div", _hoisted_4$2, [createBaseVNode("button", {
					type: "button",
					onClick: _cache[0] || (_cache[0] = ($event) => openAddModal("income")),
					class: "flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md cursor-pointer"
				}, [createVNode(unref(CirclePlus), { class: "w-4 h-4" }), _cache[10] || (_cache[10] = createTextVNode(" تسجيل إيراد بالخزينة ", -1))]), createBaseVNode("button", {
					type: "button",
					onClick: _cache[1] || (_cache[1] = ($event) => openAddModal("expense")),
					class: "flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md cursor-pointer"
				}, [createVNode(unref(CirclePlus), { class: "w-4 h-4" }), _cache[11] || (_cache[11] = createTextVNode(" تسجيل مصروفات ", -1))])])]),
				stats.value ? (openBlock(), createElementBlock("div", _hoisted_5$2, [
					createBaseVNode("div", _hoisted_6$2, [createBaseVNode("div", _hoisted_7$2, [_cache[12] || (_cache[12] = createBaseVNode("span", null, "الرصيد النقدي الحالي بالخزينة", -1)), createVNode(unref(Wallet), { class: "w-5 h-5 text-blue-600" })]), createBaseVNode("div", _hoisted_8$2, toDisplayString(totalTreasuryBalance.value) + " ج.م ", 1)]),
					createBaseVNode("div", _hoisted_9$2, [createBaseVNode("div", _hoisted_10$2, [_cache[13] || (_cache[13] = createBaseVNode("span", null, "إجمالي إيرادات الشهر", -1)), createVNode(unref(CircleArrowDown), { class: "w-5 h-5 text-emerald-600" })]), createBaseVNode("div", _hoisted_11$2, toDisplayString(stats.value.monthIncome) + " ج.م ", 1)]),
					createBaseVNode("div", _hoisted_12$2, [
						createBaseVNode("div", _hoisted_13$2, [_cache[14] || (_cache[14] = createBaseVNode("span", null, "مصروفات + عمولات الشهر", -1)), createVNode(unref(CircleArrowUp), { class: "w-5 h-5 text-rose-600" })]),
						createBaseVNode("div", _hoisted_14$2, toDisplayString(stats.value.monthExpense + stats.value.monthTechCommissions) + " ج.م ", 1),
						createBaseVNode("div", _hoisted_15$2, " منها عمولات فنيين: " + toDisplayString(stats.value.monthTechCommissions) + " ج.م ", 1)
					]),
					createBaseVNode("div", _hoisted_16$2, [
						createBaseVNode("div", _hoisted_17$2, [_cache[15] || (_cache[15] = createBaseVNode("span", null, "صافي ربح المركز هذا الشهر", -1)), createVNode(unref(TrendingUp), { class: "w-5 h-5 text-teal-600" })]),
						createBaseVNode("div", _hoisted_18$2, toDisplayString(stats.value.monthNetProfit) + " ج.م ", 1),
						createBaseVNode("div", _hoisted_19$2, " بعد خصم تكلفة شراء القطع (" + toDisplayString(stats.value.monthPartsCost) + " ج.م) ", 1)
					])
				])) : createCommentVNode("", true),
				createBaseVNode("div", _hoisted_20$2, [createBaseVNode("table", _hoisted_21$2, [_cache[16] || (_cache[16] = createBaseVNode("thead", { class: "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold" }, [createBaseVNode("tr", null, [
					createBaseVNode("th", { class: "py-3.5 px-4" }, "#"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "التاريخ والوقت"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "نوع الحركة"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "البند / التصنيف"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "البيان التفصيلي"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "طريقة الدفع"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "المبلغ"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "حذف")
				])], -1)), createBaseVNode("tbody", _hoisted_22$2, [(openBlock(true), createElementBlock(Fragment, null, renderList(transactions.value, (tr) => {
					return openBlock(), createElementBlock("tr", { key: tr.id }, [
						createBaseVNode("td", _hoisted_23$2, toDisplayString(tr.id), 1),
						createBaseVNode("td", _hoisted_24$2, toDisplayString(tr.created_at), 1),
						createBaseVNode("td", _hoisted_25$2, [createBaseVNode("span", { class: normalizeClass(["px-2.5 py-1 rounded-full font-bold text-[11px]", tr.transaction_type === "income" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : tr.transaction_type === "tech_commission" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"]) }, toDisplayString(tr.transaction_type === "income" ? "إيراد (+)" : tr.transaction_type === "tech_commission" ? "عمولة فني (-)" : "مصروف (-)"), 3)]),
						createBaseVNode("td", _hoisted_26$2, toDisplayString(tr.category), 1),
						createBaseVNode("td", _hoisted_27$1, toDisplayString(tr.description), 1),
						createBaseVNode("td", _hoisted_28$1, toDisplayString(unref(PAYMENT_METHODS)[tr.payment_method] || tr.payment_method), 1),
						createBaseVNode("td", { class: normalizeClass(["py-3 px-4 font-black text-sm", tr.transaction_type === "income" ? "text-emerald-600" : "text-rose-600"]) }, toDisplayString(tr.transaction_type === "income" ? "+" : "-") + toDisplayString(tr.amount) + " ج.م ", 3),
						createBaseVNode("td", _hoisted_29$1, [createBaseVNode("button", {
							type: "button",
							onClick: ($event) => handleDeleteTransaction(tr.id),
							class: "p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 dark:bg-slate-800 cursor-pointer"
						}, [createVNode(unref(Trash2), { class: "w-4 h-4" })], 8, _hoisted_30$1)])
					]);
				}), 128))])])]),
				modalOpen.value ? (openBlock(), createElementBlock("div", _hoisted_31$1, [createBaseVNode("div", _hoisted_32$1, [createBaseVNode("div", _hoisted_33$1, [createBaseVNode("h3", _hoisted_34$1, toDisplayString(form.value.transaction_type === "income" ? "تسجيل إيراد نقدي جديد" : "تسجيل مصروفات من الخزينة"), 1), createBaseVNode("button", {
					onClick: _cache[2] || (_cache[2] = ($event) => modalOpen.value = false),
					class: "cursor-pointer"
				}, [createVNode(unref(X), { class: "w-4 h-4" })])]), createBaseVNode("form", {
					onSubmit: withModifiers(handleSaveTransaction, ["prevent"]),
					class: "p-6 space-y-3"
				}, [
					createBaseVNode("div", null, [_cache[17] || (_cache[17] = createBaseVNode("label", { class: "block font-bold mb-1" }, "التصنيف / البند *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.category = $event),
						required: "",
						type: "text",
						placeholder: "مثال: إيجار / كهرباء / انتقالات فنيين / إعلانات ممولة",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, null, 512), [[vModelText, form.value.category]])]),
					createBaseVNode("div", _hoisted_35$1, [createBaseVNode("div", null, [_cache[18] || (_cache[18] = createBaseVNode("label", { class: "block font-bold mb-1" }, "المبلغ (ج.م) *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.amount = $event),
						required: "",
						type: "number",
						min: "1",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-black text-sm"
					}, null, 512), [[
						vModelText,
						form.value.amount,
						void 0,
						{ number: true }
					]])]), createBaseVNode("div", null, [_cache[19] || (_cache[19] = createBaseVNode("label", { class: "block font-bold mb-1" }, "وسيلة الدفع", -1)), withDirectives(createBaseVNode("select", {
						"onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.value.payment_method = $event),
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, [(openBlock(true), createElementBlock(Fragment, null, renderList(unref(PAYMENT_METHODS), (label, k) => {
						return openBlock(), createElementBlock("option", {
							key: k,
							value: k
						}, toDisplayString(label), 9, _hoisted_36$1);
					}), 128))], 512), [[vModelSelect, form.value.payment_method]])])]),
					createBaseVNode("div", null, [_cache[20] || (_cache[20] = createBaseVNode("label", { class: "block font-bold mb-1" }, "البيان التفصيلي *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.value.description = $event),
						required: "",
						type: "text",
						placeholder: "تفاصيل العملية...",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.description]])]),
					createBaseVNode("div", _hoisted_37$1, [createBaseVNode("button", {
						type: "button",
						onClick: _cache[7] || (_cache[7] = ($event) => modalOpen.value = false),
						class: "px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
					}, " إلغاء "), _cache[21] || (_cache[21] = createBaseVNode("button", {
						type: "submit",
						class: "px-5 py-2 rounded-xl bg-blue-600 text-white font-bold cursor-pointer"
					}, " حفظ بالخزينة ", -1))])
				], 32)])])) : createCommentVNode("", true)
			]);
		};
	}
});
// src/renderer/src/views/SettingsView.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$1 = { class: "space-y-6 max-w-5xl" };
var _hoisted_2$1 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4" };
var _hoisted_3$1 = { class: "text-xl font-black text-slate-900 dark:text-white flex items-center gap-2" };
var _hoisted_4$1 = {
	key: 0,
	class: "p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2"
};
var _hoisted_5$1 = { class: "grid grid-cols-1 md:grid-cols-3 gap-6 text-xs" };
var _hoisted_6$1 = { class: "md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4" };
var _hoisted_7$1 = { class: "grid grid-cols-1 md:grid-cols-2 gap-3" };
var _hoisted_8$1 = { class: "grid grid-cols-1 md:grid-cols-3 gap-3" };
var _hoisted_9$1 = { class: "grid grid-cols-1 md:grid-cols-3 gap-3 pt-2" };
var _hoisted_10$1 = { class: "block font-bold mb-1 flex items-center gap-1" };
var _hoisted_11$1 = { class: "space-y-6" };
var _hoisted_12$1 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3" };
var _hoisted_13$1 = { class: "font-black text-sm flex items-center gap-2" };
var _hoisted_14$1 = { class: "h-32 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center bg-slate-50 dark:bg-slate-800/40 overflow-hidden" };
var _hoisted_15$1 = ["src"];
var _hoisted_16$1 = {
	key: 1,
	class: "text-slate-400"
};
var _hoisted_17$1 = { class: "flex gap-2" };
var _hoisted_18$1 = { class: "flex-1 text-center py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer" };
var _hoisted_19$1 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3" };
var _hoisted_20$1 = { class: "font-black text-sm flex items-center gap-2" };
var _hoisted_21$1 = { class: "p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-[10px] break-all" };
var _hoisted_22$1 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3" };
var _hoisted_23$1 = { class: "flex items-center justify-between" };
var _hoisted_24$1 = { class: "px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono font-bold text-xs" };
var _hoisted_25$1 = { class: "flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70" };
var _hoisted_26$1 = ["src"];
// src/renderer/src/views/SettingsView.vue
var SettingsView_default = /* @__PURE__ */ defineComponent({
	__name: "SettingsView",
	setup(__props) {
		const appStore = useAppStore();
		const form = /* @__PURE__ */ ref({ ...appStore.settings });
		const dbPath = /* @__PURE__ */ ref("");
		const statusMessage = /* @__PURE__ */ ref("");
		async function loadSettingsData() {
			await appStore.loadSettings();
			form.value = { ...appStore.settings };
			dbPath.value = await window.api.getDatabasePath();
		}
		function handleLogoUpload(e) {
			const file = e.target.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = () => {
				form.value.logo_base64 = String(reader.result || "");
			};
			reader.readAsDataURL(file);
		}
		async function handleSaveSettings() {
			await window.api.saveSettings(form.value);
			await appStore.loadSettings();
			statusMessage.value = "تم حفظ إعدادات المركز وقوالب الطباعة بنجاح!";
			setTimeout(() => {
				statusMessage.value = "";
			}, 4e3);
		}
		async function handleCreateBackup() {
			const res = await window.api.createBackup();
			if (res.success) statusMessage.value = `تم حفظ النسخة الاحتياطية بنجاح في: ${res.filePath}`;
		}
		async function handleRestoreBackup() {
			if (!confirm("تنبيه هام: استعادة نسخة احتياطية ستقوم باستبدال البيانات الحالية بالنسخة المختارة. هل تريد المتابعة؟")) return;
			if ((await window.api.restoreBackup()).success) {
				await loadSettingsData();
				statusMessage.value = "تم استعادة قاعدة البيانات بنجاح!";
			}
		}
		onMounted(loadSettingsData);
		return (_ctx, _cache) => {
			return openBlock(), createElementBlock("div", _hoisted_1$1, [
				createBaseVNode("div", _hoisted_2$1, [createBaseVNode("div", null, [createBaseVNode("h1", _hoisted_3$1, [createVNode(unref(Settings), { class: "w-5 h-5 text-blue-600" }), _cache[12] || (_cache[12] = createTextVNode(" إعدادات المركز، قوالب الطباعة (A4 / 80mm)، والنسخ الاحتياطي ", -1))]), _cache[13] || (_cache[13] = createBaseVNode("p", { class: "text-xs text-slate-500 dark:text-slate-400 mt-0.5" }, " تخصيص اسم وشعار المركز، أرقام التواصل، بنود شهادة الضمان، وإدارة قاعدة البيانات المحلية ", -1))]), createBaseVNode("button", {
					type: "button",
					onClick: handleSaveSettings,
					class: "flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md cursor-pointer"
				}, [createVNode(unref(Save), { class: "w-4 h-4" }), _cache[14] || (_cache[14] = createTextVNode(" حفظ كافة الإعدادات ", -1))])]),
				statusMessage.value ? (openBlock(), createElementBlock("div", _hoisted_4$1, [createVNode(unref(CircleCheck), { class: "w-5 h-5 text-emerald-600" }), createBaseVNode("span", null, toDisplayString(statusMessage.value), 1)])) : createCommentVNode("", true),
				createBaseVNode("div", _hoisted_5$1, [createBaseVNode("div", _hoisted_6$1, [
					_cache[27] || (_cache[27] = createBaseVNode("h3", { class: "font-black text-sm text-slate-900 dark:text-white border-b pb-2" }, " 🏢 البيانات الأساسية لمركز الصيانة (تظهر في الفواتير وشهادات الضمان) ", -1)),
					createBaseVNode("div", _hoisted_7$1, [createBaseVNode("div", null, [_cache[15] || (_cache[15] = createBaseVNode("label", { class: "block font-bold mb-1" }, "اسم مركز الصيانة *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.center_name = $event),
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, null, 512), [[vModelText, form.value.center_name]])]), createBaseVNode("div", null, [_cache[16] || (_cache[16] = createBaseVNode("label", { class: "block font-bold mb-1" }, "الوصف المختصر تحت الاسم", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.center_subtitle = $event),
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.center_subtitle]])])]),
					createBaseVNode("div", _hoisted_8$1, [
						createBaseVNode("div", null, [_cache[17] || (_cache[17] = createBaseVNode("label", { class: "block font-bold mb-1" }, "رقم خدمة العملاء 1", -1)), withDirectives(createBaseVNode("input", {
							"onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.phone1 = $event),
							type: "text",
							class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
						}, null, 512), [[vModelText, form.value.phone1]])]),
						createBaseVNode("div", null, [_cache[18] || (_cache[18] = createBaseVNode("label", { class: "block font-bold mb-1" }, "رقم خدمة العملاء 2", -1)), withDirectives(createBaseVNode("input", {
							"onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.phone2 = $event),
							type: "text",
							class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
						}, null, 512), [[vModelText, form.value.phone2]])]),
						createBaseVNode("div", null, [_cache[19] || (_cache[19] = createBaseVNode("label", { class: "block font-bold mb-1" }, "رقم واتساب المركز", -1)), withDirectives(createBaseVNode("input", {
							"onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.whatsapp = $event),
							type: "text",
							class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
						}, null, 512), [[vModelText, form.value.whatsapp]])])
					]),
					createBaseVNode("div", null, [_cache[20] || (_cache[20] = createBaseVNode("label", { class: "block font-bold mb-1" }, "عنوان المركز بالتفصيل", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.value.address = $event),
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.address]])]),
					createBaseVNode("div", _hoisted_9$1, [
						createBaseVNode("div", null, [createBaseVNode("label", _hoisted_10$1, [createVNode(unref(Printer), { class: "w-3.5 h-3.5 text-blue-600" }), _cache[21] || (_cache[21] = createTextVNode(" قالب الطباعة الافتراضي ", -1))]), withDirectives(createBaseVNode("select", {
							"onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.value.default_print_format = $event),
							class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
						}, [..._cache[22] || (_cache[22] = [createBaseVNode("option", { value: "a4" }, "قالب ورق A4 / A5 الرسمي", -1), createBaseVNode("option", { value: "thermal80" }, "قالب طابعة إيصالات حرارية 80mm", -1)])], 512), [[vModelSelect, form.value.default_print_format]])]),
						createBaseVNode("div", null, [_cache[23] || (_cache[23] = createBaseVNode("label", { class: "block font-bold mb-1" }, "رسوم الكشف الافتراضية (ج.م)", -1)), withDirectives(createBaseVNode("input", {
							"onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.value.default_inspection_fee = $event),
							type: "number",
							class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
						}, null, 512), [[
							vModelText,
							form.value.default_inspection_fee,
							void 0,
							{ number: true }
						]])]),
						createBaseVNode("div", null, [_cache[24] || (_cache[24] = createBaseVNode("label", { class: "block font-bold mb-1" }, "مدة الضمان الافتراضية (بالشهور)", -1)), withDirectives(createBaseVNode("input", {
							"onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.value.default_warranty_months = $event),
							type: "number",
							class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
						}, null, 512), [[
							vModelText,
							form.value.default_warranty_months,
							void 0,
							{ number: true }
						]])])
					]),
					createBaseVNode("div", null, [_cache[25] || (_cache[25] = createBaseVNode("label", { class: "block font-bold mb-1" }, "بنود وشروط شهادة الضمان المطبوعة", -1)), withDirectives(createBaseVNode("textarea", {
						"onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.value.warranty_terms = $event),
						rows: "4",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 leading-relaxed"
					}, null, 512), [[vModelText, form.value.warranty_terms]])]),
					createBaseVNode("div", null, [_cache[26] || (_cache[26] = createBaseVNode("label", { class: "block font-bold mb-1" }, "تذييل الفاتورة والإيصال (Footer)", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.value.receipt_footer = $event),
						type: "text",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.receipt_footer]])])
				]), createBaseVNode("div", _hoisted_11$1, [
					createBaseVNode("div", _hoisted_12$1, [
						createBaseVNode("h3", _hoisted_13$1, [createVNode(unref(Image), { class: "w-4 h-4 text-blue-600" }), _cache[28] || (_cache[28] = createTextVNode(" شعار المركز (Logo) ", -1))]),
						createBaseVNode("div", _hoisted_14$1, [form.value.logo_base64 ? (openBlock(), createElementBlock("img", {
							key: 0,
							src: form.value.logo_base64,
							alt: "Logo",
							class: "max-h-28 object-contain"
						}, null, 8, _hoisted_15$1)) : (openBlock(), createElementBlock("span", _hoisted_16$1, "لا يوجد شعار مرفوع حالياً"))]),
						createBaseVNode("div", _hoisted_17$1, [createBaseVNode("label", _hoisted_18$1, [_cache[29] || (_cache[29] = createTextVNode(" اختيار صورة شعار ", -1)), createBaseVNode("input", {
							type: "file",
							accept: "image/*",
							onChange: handleLogoUpload,
							class: "hidden"
						}, null, 32)]), form.value.logo_base64 ? (openBlock(), createElementBlock("button", {
							key: 0,
							type: "button",
							onClick: _cache[11] || (_cache[11] = ($event) => form.value.logo_base64 = ""),
							class: "px-3 py-2 rounded-xl bg-rose-100 text-rose-700 font-bold cursor-pointer"
						}, " حذف ")) : createCommentVNode("", true)])
					]),
					createBaseVNode("div", _hoisted_19$1, [
						createBaseVNode("h3", _hoisted_20$1, [createVNode(unref(DatabaseBackup), { class: "w-4 h-4 text-emerald-600" }), _cache[30] || (_cache[30] = createTextVNode(" النسخ الاحتياطي لقاعدة البيانات (SQLite) ", -1))]),
						_cache[33] || (_cache[33] = createBaseVNode("p", { class: "text-[11px] text-slate-500 leading-relaxed" }, " احفظ نسخة احتياطية من جميع بيانات العملاء، الفواتير، المخزن، والخزينة على فلاشة خارجية أو قرص آخر لضمان الأمان التام. ", -1)),
						createBaseVNode("div", _hoisted_21$1, " مسار قاعدة البيانات: " + toDisplayString(dbPath.value), 1),
						createBaseVNode("button", {
							type: "button",
							onClick: handleCreateBackup,
							class: "w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
						}, [createVNode(unref(DatabaseBackup), { class: "w-4 h-4" }), _cache[31] || (_cache[31] = createTextVNode(" حفظ نسخة احتياطية الآن ", -1))]),
						createBaseVNode("button", {
							type: "button",
							onClick: handleRestoreBackup,
							class: "w-full py-2.5 px-4 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-bold flex items-center justify-center gap-2 cursor-pointer"
						}, [createVNode(unref(Upload), { class: "w-4 h-4" }), _cache[32] || (_cache[32] = createTextVNode(" استعادة نسخة احتياطية سابقة ", -1))])
					]),
					createBaseVNode("div", _hoisted_22$1, [createBaseVNode("div", _hoisted_23$1, [_cache[34] || (_cache[34] = createBaseVNode("span", { class: "font-black text-sm text-slate-900 dark:text-white" }, "معلومات النظام والشركة المطورة", -1)), createBaseVNode("span", _hoisted_24$1, toDisplayString(unref(appStore).appVersion), 1)]), createBaseVNode("div", _hoisted_25$1, [createBaseVNode("img", {
						src: unref(joker_tech_logo_default),
						alt: "شركة الجوكر تك",
						class: "w-12 h-12 object-contain bg-white rounded-xl p-1.5 border border-slate-200 shrink-0"
					}, null, 8, _hoisted_26$1), _cache[35] || (_cache[35] = createBaseVNode("div", null, [createBaseVNode("div", { class: "font-black text-xs text-slate-900 dark:text-white" }, " تطوير: الجوكر تك (Al-Joker Tech) "), createBaseVNode("p", { class: "text-[11px] text-slate-500 dark:text-slate-400 mt-0.5" }, " برنامج صلحلي — نظام إدارة مراكز صيانة الأجهزة الكهربائية والمنزلية. ")], -1))])])
				])])
			]);
		};
	}
});
// src/renderer/src/views/SuperAdminView.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1 = { class: "space-y-6" };
var _hoisted_2 = { class: "flex flex-wrap items-center justify-between gap-4 bg-gradient-to-l from-purple-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-lg" };
var _hoisted_3 = { class: "flex items-center gap-3.5" };
var _hoisted_4 = { class: "p-3 rounded-2xl bg-white/10 border border-white/20" };
var _hoisted_5 = { class: "grid grid-cols-1 md:grid-cols-3 gap-4" };
var _hoisted_6 = { class: "text-xs text-slate-600 dark:text-slate-400" };
var _hoisted_7 = {
	key: 0,
	class: "p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-between"
};
var _hoisted_8 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden" };
var _hoisted_9 = { class: "overflow-x-auto" };
var _hoisted_10 = { class: "w-full text-right text-sm" };
var _hoisted_11 = { class: "divide-y divide-slate-200 dark:divide-slate-800 text-xs" };
var _hoisted_12 = { class: "py-3.5 px-4 font-bold" };
var _hoisted_13 = { class: "py-3.5 px-4 font-mono font-bold text-sm text-blue-600 dark:text-blue-400" };
var _hoisted_14 = { class: "py-3.5 px-4 font-bold text-slate-900 dark:text-white" };
var _hoisted_15 = {
	key: 0,
	class: "text-[11px] text-slate-500 font-normal"
};
var _hoisted_16 = { class: "py-3.5 px-4" };
var _hoisted_17 = { class: "py-3.5 px-4" };
var _hoisted_18 = { class: "py-3.5 px-4" };
var _hoisted_19 = {
	key: 0,
	class: "inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold"
};
var _hoisted_20 = {
	key: 1,
	class: "inline-flex items-center gap-1 text-rose-600 font-bold"
};
var _hoisted_21 = { class: "py-3.5 px-4" };
var _hoisted_22 = {
	key: 0,
	class: "flex items-center gap-1.5"
};
var _hoisted_23 = ["onClick"];
var _hoisted_24 = ["onClick"];
var _hoisted_25 = ["onClick"];
var _hoisted_26 = {
	key: 1,
	class: "text-slate-400"
};
var _hoisted_27 = { class: "py-3.5 px-4" };
var _hoisted_28 = { class: "flex items-center gap-2" };
var _hoisted_29 = ["onClick"];
var _hoisted_30 = ["onClick"];
var _hoisted_31 = {
	key: 1,
	class: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
};
var _hoisted_32 = { class: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" };
var _hoisted_33 = { class: "px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" };
var _hoisted_34 = { class: "font-bold text-base text-slate-900 dark:text-white flex items-center gap-2" };
var _hoisted_35 = {
	key: 0,
	class: "p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-600 font-bold"
};
var _hoisted_36 = { class: "grid grid-cols-2 gap-3" };
var _hoisted_37 = ["disabled"];
var _hoisted_38 = { class: "block font-bold mb-1" };
var _hoisted_39 = ["placeholder"];
var _hoisted_40 = { class: "grid grid-cols-2 gap-3" };
var _hoisted_41 = { class: "grid grid-cols-2 gap-3" };
var _hoisted_42 = ["disabled"];
var _hoisted_43 = ["disabled"];
var _hoisted_44 = {
	key: 1,
	class: "p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-3"
};
var _hoisted_45 = { class: "flex items-center justify-between" };
var _hoisted_46 = { class: "font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5" };
var _hoisted_47 = { class: "flex gap-1" };
var _hoisted_48 = { class: "grid grid-cols-2 gap-3" };
var _hoisted_49 = { class: "flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800" };
// src/renderer/src/views/SuperAdminView.vue
var SuperAdminView_default = /* @__PURE__ */ defineComponent({
	__name: "SuperAdminView",
	setup(__props) {
		const users = /* @__PURE__ */ ref([]);
		const modalOpen = /* @__PURE__ */ ref(false);
		const errorMsg = /* @__PURE__ */ ref("");
		const successMsg = /* @__PURE__ */ ref("");
		const form = /* @__PURE__ */ ref({
			username: "",
			password: "",
			full_name: "",
			phone: "",
			role: "tenant",
			is_active: 1,
			subscription_start: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
			subscription_end: "",
			notes: ""
		});
		async function loadUsers() {
			users.value = await window.api.listUsers();
		}
		function openCreateModal() {
			errorMsg.value = "";
			const today = /* @__PURE__ */ new Date();
			const nextMonth = /* @__PURE__ */ new Date();
			nextMonth.setMonth(nextMonth.getMonth() + 1);
			form.value = {
				username: "",
				password: "",
				full_name: "",
				phone: "",
				role: "tenant",
				is_active: 1,
				subscription_start: today.toISOString().slice(0, 10),
				subscription_end: nextMonth.toISOString().slice(0, 10),
				notes: ""
			};
			modalOpen.value = true;
		}
		function openEditModal(u) {
			errorMsg.value = "";
			form.value = {
				id: u.id,
				username: u.username,
				password: "",
				full_name: u.full_name,
				phone: u.phone || "",
				role: u.role,
				is_active: u.is_active,
				subscription_start: u.subscription_start || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
				subscription_end: u.subscription_end || "",
				notes: u.notes || ""
			};
			modalOpen.value = true;
		}
		function setQuickSubscriptionMonths(months) {
			const start = form.value.subscription_start ? new Date(form.value.subscription_start) : /* @__PURE__ */ new Date();
			const end = new Date(start);
			end.setMonth(end.getMonth() + months);
			form.value.subscription_end = end.toISOString().slice(0, 10);
		}
		async function extendTenantSubscription(user, months) {
			const baseDate = user.subscription_end && new Date(user.subscription_end) > /* @__PURE__ */ new Date() ? new Date(user.subscription_end) : /* @__PURE__ */ new Date();
			baseDate.setMonth(baseDate.getMonth() + months);
			const newEnd = baseDate.toISOString().slice(0, 10);
			await window.api.saveUser({
				...user,
				is_active: 1,
				subscription_start: user.subscription_start || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
				subscription_end: newEnd
			});
			successMsg.value = `تم تجديد اشتراك المستأجر (${user.full_name}) لمدة ${months} شهر حتى تاريخ ${newEnd}`;
			await loadUsers();
		}
		async function handleSaveUser() {
			errorMsg.value = "";
			if (!form.value.username.trim() || !form.value.full_name.trim()) {
				errorMsg.value = "يرجى إدخال اسم المستخدم والاسم الكامل";
				return;
			}
			if (!form.value.id && !form.value.password.trim()) {
				errorMsg.value = "يرجى تحديد كلمة مرور للمستخدم الجديد";
				return;
			}
			if (form.value.role === "tenant" && !form.value.subscription_end) {
				errorMsg.value = "يرجى تحديد تاريخ انتهاء الاشتراك لحساب مستأجر البرنامج";
				return;
			}
			try {
				await window.api.saveUser({
					...form.value,
					subscription_start: form.value.role === "tenant" ? form.value.subscription_start : null,
					subscription_end: form.value.role === "tenant" ? form.value.subscription_end : null
				});
				modalOpen.value = false;
				successMsg.value = "تم حفظ بيانات المستخدم والصلاحية بنجاح";
				await loadUsers();
			} catch (err) {
				errorMsg.value = err instanceof Error ? err.message : "تعذر حفظ المستخدم (ربما اسم المستخدم مكرر)";
			}
		}
		async function handleDeleteUser(user) {
			if (user.username === "admin") return;
			if (!confirm(`هل أنت متأكد من حذف المستخدم "${user.full_name}"؟`)) return;
			try {
				await window.api.deleteUser(user.id);
				await loadUsers();
			} catch (err) {
				alert(err instanceof Error ? err.message : "فشل الحذف");
			}
		}
		function getTenantDaysStatus(user) {
			if (user.role !== "tenant") return {
				text: "ترخيص دائم (غير محدد بمدة)",
				color: "text-emerald-600 dark:text-emerald-400"
			};
			if (!user.subscription_end) return {
				text: "بدون تاريخ انتهاء",
				color: "text-rose-600"
			};
			const today = /* @__PURE__ */ new Date();
			today.setHours(0, 0, 0, 0);
			const end = new Date(user.subscription_end);
			end.setHours(23, 59, 59, 999);
			const days = Math.ceil((end.getTime() - today.getTime()) / 864e5);
			if (days < 0) return {
				text: `منتهي منذ ${Math.abs(days)} يوم (${user.subscription_end})`,
				color: "text-rose-600 dark:text-rose-400 font-bold"
			};
			if (days <= 7) return {
				text: `متبقي ${days} أيام فقط (ينتهي ${user.subscription_end})`,
				color: "text-amber-600 dark:text-amber-400 font-bold"
			};
			return {
				text: `ساري - متبقي ${days} يوم (ينتهي ${user.subscription_end})`,
				color: "text-blue-600 dark:text-blue-400 font-semibold"
			};
		}
		onMounted(loadUsers);
		return (_ctx, _cache) => {
			return openBlock(), createElementBlock("div", _hoisted_1, [
				createBaseVNode("div", _hoisted_2, [createBaseVNode("div", _hoisted_3, [createBaseVNode("div", _hoisted_4, [createVNode(unref(ShieldCheck), { class: "w-8 h-8 text-purple-300" })]), _cache[16] || (_cache[16] = createBaseVNode("div", null, [createBaseVNode("h1", { class: "text-xl font-black" }, " لوحة تحكم السوبر أدمن (إدارة التراخيص والمالكين والمستأجرين) "), createBaseVNode("p", { class: "text-xs text-purple-200 mt-1" }, " تحكم كامل في حسابات مالكي البرنامج (النسخ الدائمة) ومستأجري البرنامج (بنظام الاشتراك الشهري/السنوي) ")], -1))]), createBaseVNode("button", {
					type: "button",
					onClick: openCreateModal,
					class: "flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-indigo-950 hover:bg-purple-50 font-black text-xs shadow-md transition cursor-pointer"
				}, [createVNode(unref(UserPlus), { class: "w-4 h-4" }), _cache[17] || (_cache[17] = createTextVNode(" إضافة مستخدم / ترخيص جديد ", -1))])]),
				createBaseVNode("div", _hoisted_5, [(openBlock(true), createElementBlock(Fragment, null, renderList(unref(USER_ROLE_LABELS), (info, roleKey) => {
					return openBlock(), createElementBlock("div", {
						key: roleKey,
						class: "p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
					}, [createBaseVNode("span", { class: normalizeClass(["inline-block px-3 py-1 rounded-full text-xs font-bold mb-2", info.badge]) }, toDisplayString(info.label), 3), createBaseVNode("p", _hoisted_6, toDisplayString(info.desc), 1)]);
				}), 128))]),
				successMsg.value ? (openBlock(), createElementBlock("div", _hoisted_7, [createBaseVNode("span", null, toDisplayString(successMsg.value), 1), createBaseVNode("button", {
					onClick: _cache[0] || (_cache[0] = ($event) => successMsg.value = ""),
					class: "text-xs underline cursor-pointer"
				}, "إغلاق")])) : createCommentVNode("", true),
				createBaseVNode("div", _hoisted_8, [createBaseVNode("div", _hoisted_9, [createBaseVNode("table", _hoisted_10, [_cache[20] || (_cache[20] = createBaseVNode("thead", { class: "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold" }, [createBaseVNode("tr", null, [
					createBaseVNode("th", { class: "py-3.5 px-4" }, "#"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "اسم المستخدم"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "الاسم الكامل"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "نوع الصلاحية / الترخيص"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "حالة الاشتراك والمدة"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "الحالة"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "تجديد سريع للمستأجر"),
					createBaseVNode("th", { class: "py-3.5 px-4" }, "إجراءات")
				])], -1)), createBaseVNode("tbody", _hoisted_11, [(openBlock(true), createElementBlock(Fragment, null, renderList(users.value, (u) => {
					return openBlock(), createElementBlock("tr", {
						key: u.id,
						class: "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
					}, [
						createBaseVNode("td", _hoisted_12, toDisplayString(u.id), 1),
						createBaseVNode("td", _hoisted_13, toDisplayString(u.username), 1),
						createBaseVNode("td", _hoisted_14, [createTextVNode(toDisplayString(u.full_name) + " ", 1), u.phone ? (openBlock(), createElementBlock("div", _hoisted_15, toDisplayString(u.phone), 1)) : createCommentVNode("", true)]),
						createBaseVNode("td", _hoisted_16, [createBaseVNode("span", { class: normalizeClass(["px-2.5 py-1 rounded-full text-[11px] font-bold", unref(USER_ROLE_LABELS)[u.role]?.badge]) }, toDisplayString(unref(USER_ROLE_LABELS)[u.role]?.label), 3)]),
						createBaseVNode("td", _hoisted_17, [createBaseVNode("span", { class: normalizeClass(getTenantDaysStatus(u).color) }, toDisplayString(getTenantDaysStatus(u).text), 3)]),
						createBaseVNode("td", _hoisted_18, [u.is_active ? (openBlock(), createElementBlock("span", _hoisted_19, [createVNode(unref(CircleCheckBig), { class: "w-4 h-4" }), _cache[18] || (_cache[18] = createTextVNode(" نشط ", -1))])) : (openBlock(), createElementBlock("span", _hoisted_20, [createVNode(unref(CircleX), { class: "w-4 h-4" }), _cache[19] || (_cache[19] = createTextVNode(" موقوف ", -1))]))]),
						createBaseVNode("td", _hoisted_21, [u.role === "tenant" ? (openBlock(), createElementBlock("div", _hoisted_22, [
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => extendTenantSubscription(u, 1),
								class: "px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold text-[11px] transition cursor-pointer"
							}, " + شهر ", 8, _hoisted_23),
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => extendTenantSubscription(u, 6),
								class: "px-2 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-bold text-[11px] transition cursor-pointer"
							}, " + 6 شهور ", 8, _hoisted_24),
							createBaseVNode("button", {
								type: "button",
								onClick: ($event) => extendTenantSubscription(u, 12),
								class: "px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] transition cursor-pointer"
							}, " + سنة ", 8, _hoisted_25)
						])) : (openBlock(), createElementBlock("span", _hoisted_26, "—"))]),
						createBaseVNode("td", _hoisted_27, [createBaseVNode("div", _hoisted_28, [createBaseVNode("button", {
							type: "button",
							onClick: ($event) => openEditModal(u),
							class: "p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer",
							title: "تعديل"
						}, [createVNode(unref(PenLine), { class: "w-4 h-4" })], 8, _hoisted_29), u.username !== "admin" ? (openBlock(), createElementBlock("button", {
							key: 0,
							type: "button",
							onClick: ($event) => handleDeleteUser(u),
							class: "p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer",
							title: "حذف"
						}, [createVNode(unref(Trash2), { class: "w-4 h-4" })], 8, _hoisted_30)) : createCommentVNode("", true)])])
					]);
				}), 128))])])])]),
				modalOpen.value ? (openBlock(), createElementBlock("div", _hoisted_31, [createBaseVNode("div", _hoisted_32, [createBaseVNode("div", _hoisted_33, [createBaseVNode("h3", _hoisted_34, [createVNode(unref(KeyRound), { class: "w-5 h-5 text-purple-600" }), createBaseVNode("span", null, toDisplayString(form.value.id ? "تعديل حساب وصلاحية مستخدم" : "إنشاء مستخدم وترخيص جديد"), 1)]), createBaseVNode("button", {
					type: "button",
					onClick: _cache[1] || (_cache[1] = ($event) => modalOpen.value = false),
					class: "text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
				}, " ✕ ")]), createBaseVNode("form", {
					onSubmit: withModifiers(handleSaveUser, ["prevent"]),
					class: "p-6 space-y-4 text-xs"
				}, [
					errorMsg.value ? (openBlock(), createElementBlock("div", _hoisted_35, toDisplayString(errorMsg.value), 1)) : createCommentVNode("", true),
					createBaseVNode("div", _hoisted_36, [createBaseVNode("div", null, [_cache[21] || (_cache[21] = createBaseVNode("label", { class: "block font-bold mb-1" }, "اسم المستخدم (لتسجيل الدخول) *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.username = $event),
						disabled: form.value.username === "admin",
						type: "text",
						required: "",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 8, _hoisted_37), [[vModelText, form.value.username]])]), createBaseVNode("div", null, [createBaseVNode("label", _hoisted_38, toDisplayString(form.value.id ? "كلمة مرور جديدة (اتركها فارغة لعدم التغيير)" : "كلمة المرور *"), 1), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.password = $event),
						type: "text",
						placeholder: form.value.id ? "بدون تغيير" : "مثال: 123456",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 8, _hoisted_39), [[vModelText, form.value.password]])])]),
					createBaseVNode("div", _hoisted_40, [createBaseVNode("div", null, [_cache[22] || (_cache[22] = createBaseVNode("label", { class: "block font-bold mb-1" }, "الاسم الكامل / اسم المركز *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.full_name = $event),
						type: "text",
						required: "",
						placeholder: "مثال: م. حسن - مالك المركز",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.full_name]])]), createBaseVNode("div", null, [_cache[23] || (_cache[23] = createBaseVNode("label", { class: "block font-bold mb-1" }, "رقم الهاتف", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.value.phone = $event),
						type: "text",
						placeholder: "010xxxxxxxx",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.phone]])])]),
					createBaseVNode("div", _hoisted_41, [createBaseVNode("div", null, [_cache[25] || (_cache[25] = createBaseVNode("label", { class: "block font-bold mb-1" }, "نوع الصلاحية والترخيص *", -1)), withDirectives(createBaseVNode("select", {
						"onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.value.role = $event),
						disabled: form.value.username === "admin",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, [..._cache[24] || (_cache[24] = [
						createBaseVNode("option", { value: "super_admin" }, "سوبر أدمن (مالك البرنامج بالكامل)", -1),
						createBaseVNode("option", { value: "owner" }, "مستخدم مالك البرنامج (نسخة دائمة)", -1),
						createBaseVNode("option", { value: "tenant" }, "مستخدم مستأجر البرنامج (اشتراك محدد)", -1)
					])], 8, _hoisted_42), [[vModelSelect, form.value.role]])]), createBaseVNode("div", null, [_cache[27] || (_cache[27] = createBaseVNode("label", { class: "block font-bold mb-1" }, "حالة الحساب", -1)), withDirectives(createBaseVNode("select", {
						"onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.value.is_active = $event),
						disabled: form.value.username === "admin",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
					}, [..._cache[26] || (_cache[26] = [createBaseVNode("option", { value: 1 }, "نشط ومفعل", -1), createBaseVNode("option", { value: 0 }, "موقوف مؤقتاً", -1)])], 8, _hoisted_43), [[vModelSelect, form.value.is_active]])])]),
					form.value.role === "tenant" ? (openBlock(), createElementBlock("div", _hoisted_44, [createBaseVNode("div", _hoisted_45, [createBaseVNode("span", _hoisted_46, [createVNode(unref(CalendarClock), { class: "w-4 h-4" }), _cache[28] || (_cache[28] = createTextVNode(" إعدادات فترة إيجار البرنامج للمستأجر ", -1))]), createBaseVNode("div", _hoisted_47, [
						createBaseVNode("button", {
							type: "button",
							onClick: _cache[8] || (_cache[8] = ($event) => setQuickSubscriptionMonths(1)),
							class: "px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold cursor-pointer"
						}, " شهر "),
						createBaseVNode("button", {
							type: "button",
							onClick: _cache[9] || (_cache[9] = ($event) => setQuickSubscriptionMonths(3)),
							class: "px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold cursor-pointer"
						}, " 3 شهور "),
						createBaseVNode("button", {
							type: "button",
							onClick: _cache[10] || (_cache[10] = ($event) => setQuickSubscriptionMonths(6)),
							class: "px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold cursor-pointer"
						}, " 6 شهور "),
						createBaseVNode("button", {
							type: "button",
							onClick: _cache[11] || (_cache[11] = ($event) => setQuickSubscriptionMonths(12)),
							class: "px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold cursor-pointer"
						}, " سنة ")
					])]), createBaseVNode("div", _hoisted_48, [createBaseVNode("div", null, [_cache[29] || (_cache[29] = createBaseVNode("label", { class: "block font-bold mb-1" }, "تاريخ بداية الاشتراك", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.value.subscription_start = $event),
						type: "date",
						class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700"
					}, null, 512), [[vModelText, form.value.subscription_start]])]), createBaseVNode("div", null, [_cache[30] || (_cache[30] = createBaseVNode("label", { class: "block font-bold mb-1" }, "تاريخ نهاية الاشتراك *", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => form.value.subscription_end = $event),
						type: "date",
						required: "",
						class: "w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700"
					}, null, 512), [[vModelText, form.value.subscription_end]])])])])) : createCommentVNode("", true),
					createBaseVNode("div", null, [_cache[31] || (_cache[31] = createBaseVNode("label", { class: "block font-bold mb-1" }, "ملاحظات", -1)), withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => form.value.notes = $event),
						type: "text",
						placeholder: "ملاحظات إضافية عن الترخيص...",
						class: "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
					}, null, 512), [[vModelText, form.value.notes]])]),
					createBaseVNode("div", _hoisted_49, [createBaseVNode("button", {
						type: "button",
						onClick: _cache[15] || (_cache[15] = ($event) => modalOpen.value = false),
						class: "px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
					}, " إلغاء "), _cache[32] || (_cache[32] = createBaseVNode("button", {
						type: "submit",
						class: "px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
					}, " حفظ المستخدم والترخيص ", -1))])
				], 32)])])) : createCommentVNode("", true)
			]);
		};
	}
});
// src/renderer/src/router/index.ts
var router = createRouter({
	history: createWebHashHistory(),
	routes: [
		{
			path: "/login",
			name: "login",
			component: LoginView_default
		},
		{
			path: "/",
			redirect: "/dashboard"
		},
		{
			path: "/dashboard",
			name: "dashboard",
			component: DashboardView_default,
			meta: { requiresAuth: true }
		},
		{
			path: "/tickets",
			name: "tickets",
			component: TicketsView_default,
			meta: { requiresAuth: true }
		},
		{
			path: "/customers",
			name: "customers",
			component: CustomersView_default,
			meta: { requiresAuth: true }
		},
		{
			path: "/technicians",
			name: "technicians",
			component: TechniciansView_default,
			meta: { requiresAuth: true }
		},
		{
			path: "/inventory",
			name: "inventory",
			component: InventoryView_default,
			meta: { requiresAuth: true }
		},
		{
			path: "/treasury",
			name: "treasury",
			component: TreasuryView_default,
			meta: { requiresAuth: true }
		},
		{
			path: "/settings",
			name: "settings",
			component: SettingsView_default,
			meta: { requiresAuth: true }
		},
		{
			path: "/super-admin",
			name: "super-admin",
			component: SuperAdminView_default,
			meta: {
				requiresAuth: true,
				requiresSuperAdmin: true
			}
		}
	]
});
router.beforeEach((to) => {
	const appStore = useAppStore();
	if (to.meta.requiresAuth && !appStore.isAuthenticated) return { name: "login" };
	if (to.name === "login" && appStore.isAuthenticated) return { name: "dashboard" };
	if (to.meta.requiresSuperAdmin && !appStore.isSuperAdmin) return { name: "dashboard" };
	return true;
});
// src/renderer/src/main.ts
var app = createApp(App_default);
app.use(createPinia());
app.use(router);
app.mount("#app");
