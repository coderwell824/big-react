import { Dispatch, Dispatcher } from "react/src/curentDispatcher";
import { FiberNode } from "./fiber";
import internals from "shared/internals";
import { UpdateQueue, createUpdate, createUpdateQueue, enqueueUpdate, processUpdateQueue } from "./updateQueue";
import { Action } from "shared/ReactTypes";
import { scheduleUpdateFiber } from "./workLoop";
import { Lane, NoLane, requestUpdateLane } from "./fiberLanes";
import { Flags, PassiveEffect } from "./fiberFlags";
import { HookHasEffect, Passive } from "./hookEffectTags";

let currentlyRenderingFiber: FiberNode | null = null;  //当前正在渲染的fiber
let workInProgressHook: Hook | null = null//当前正在处理的hook
let currentHook: Hook | null = null//当前update时正在处理的hook
let currnetRenderLane: Lane = NoLane

const { curentDispatcher } = internals;

//定义Hook结构
interface Hook {
  memoizedState: any; //每个hook存储的hook数据
  updateQueue: unknown;  //更新hook
  next: Hook | null     //指向下一个hook
}

//effect数据结构
export interface Effect {
  tag: Flags;
  create: EffectCallback | void; //立即执行函数
  destory: EffectCallback | void; //销毁执行函数
  deps: EffectDeps,
  next: Effect | null //指向下一个useEffect
}

//函数式组件的updateQueue
export interface FcUpdateQueue<State> extends UpdateQueue<State> {
  lastEffect: Effect | null; //指向effect链表中的最后一个
}



type EffectCallback = () => void;
type EffectDeps = any[] | null;


//渲染hooks组件
export function renderWithHooks(wip: FiberNode, renderLane: Lane) {

  //currentlyRenderingFiber赋值操作
  currentlyRenderingFiber = wip;
  wip.memoizedState = null; //赋值为null的原因是在接下来的hooks操作时会创建链表, 重置hooks链表
  //重置effect链表
  wip.updateQueue = null;
  currnetRenderLane = renderLane; //当前正在调度的优先级


  const current = wip.alternate; //取出当前的Fiber树
  if (current != null) {
    //update阶段
    curentDispatcher.current = HooksDispatcherOnUpdate; //curentDispatcher.current指向update时的hook的实现
  } else {
    //mount阶段
    curentDispatcher.current = HooksDispatcherOnMount;  //curentDispatcher.current指向mount时的hook的实现

  }

  const Component = wip.type; //获取函数式组件的函数的位置
  const props = wip.pendingProps; //获取函数式组件上的props
  const children = Component(props);  //获取函数的jsx

  //currentlyRenderingFiber重置操作
  currentlyRenderingFiber = null;
  workInProgressHook = null;
  currentHook = null;
  currnetRenderLane = NoLane;

  return children
}

const HooksDispatcherOnMount: Dispatcher = {
  useState: mountState,
  useEffect: mountEffect,
}
const HooksDispatcherOnUpdate: Dispatcher = {
  useState: updateState,
  useEffect: updateEffect,
}

//mount时useEffect的实现
function mountEffect(create: EffectCallback | void, deps: EffectDeps | void) {
  //1. 找到当前useEffect对应的hook数据
  const hook = mountWorkInProgressHook()
  const nextDeps = deps == undefined ? null : deps;
  (currentlyRenderingFiber as FiberNode).flags |= PassiveEffect; //增加PassiveEffect
  hook.memoizedState = pushEffect(Passive | HookHasEffect, create, undefined, nextDeps)
}

//update时useEffect的实现
function updateEffect(create: EffectCallback | void, deps: EffectDeps | void) {
  //1. 找到当前更新时对应的hook链表
  const hook = updateWorkInProgressHook()
  const nextDeps = deps == undefined ? null : deps;
  let destory: EffectCallback | void;

  if (currentHook != null) {
    const prevEffect = currentHook.memoizedState as Effect;
    destory = prevEffect.destory;

    if (nextDeps != null) {
      //浅比较依赖
      const prevDeps = prevEffect.deps;
      if (areHookInputsEqual(nextDeps, prevDeps)) {
        hook.memoizedState = pushEffect(Passive, create, destory, nextDeps);
        return
      }
    }
    //依赖浅比较后不相等
    (currentlyRenderingFiber as FiberNode).flags |= PassiveEffect; //增加PassiveEffect
    hook.memoizedState = pushEffect(Passive | HookHasEffect, create, destory, nextDeps)

  }
}

//浅比较依赖的数组
function areHookInputsEqual(nextDeps: EffectDeps, prevDeps: EffectDeps): boolean {
  if (prevDeps == null || nextDeps == null) {
    return false;
  }

  for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
    if (Object.is(prevDeps[i], nextDeps[i])) {
      continue
    };
    return false;
  }
  return true
}


//useEffect会和其他的useEffect形成环状链表
function pushEffect(hookFlags: Flags, create: EffectCallback | void, destory: EffectCallback | void, deps: EffectDeps): Effect {
  let effect: Effect = {
    tag: hookFlags,
    create,
    destory,
    deps,
    next: null
  }

  const fiber = currentlyRenderingFiber as FiberNode;
  const updateQueue = fiber.updateQueue as FcUpdateQueue<any>;

  if (updateQueue === null) { //插入第一个effect
    const updateQueue = createFcUpdateQueue();
    fiber.updateQueue = updateQueue;
    effect.next = effect;
    updateQueue.lastEffect = effect;
  } else {
    //插入后续的effect
    const lastEffect = updateQueue.lastEffect;
    if (lastEffect === null) {
      effect.next = effect;
      updateQueue.lastEffect = effect;
    } else {
      const firstEffect = lastEffect.next;
      lastEffect.next = effect;
      effect.next = firstEffect;
      updateQueue.lastEffect = effect;
    }
  }

  return effect;

}
//创建函数式组件的updateQueue
function createFcUpdateQueue<State>() {
  const updateQueue = createUpdateQueue<State>() as FcUpdateQueue<State>;
  updateQueue.lastEffect = null;
  return updateQueue
}






//mount时useState的实现
function mountState<State>(initialState: (() => State) | State): [State, Dispatch<State>] {
  //1. 找到当前useState对应的hook数据
  const hook = mountWorkInProgressHook()

  //2. 获取State
  let memoizedState: State
  if (initialState instanceof Function) {  //initialState为函数形式
    memoizedState = initialState()
  } else {
    memoizedState = initialState;
  }

  //3. useState可以触发更新, 我们为它创建一个updateQueue
  const queue = createUpdateQueue<State>();  //创建更新队列
  hook.updateQueue = queue; //将更新队列放到对应hook数据的更新队列中
  hook.memoizedState = memoizedState; //将数据保存在hook的memoizedState中

  //@ts-ignore
  const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber!, queue); //获取dispatch
  queue.dispatch = dispatch; //暴露dispatch


  return [memoizedState, dispatch]
}
//update时useState的实现
function updateState<State>(): [State, Dispatch<State>] {
  //1. 找到当前useState对应的hook数据
  const hook = updateWorkInProgressHook()

  //2. 计算新state的逻辑
  const queue = hook.updateQueue as UpdateQueue<State>;//新state保存的位置
  const pending = queue.shared.pending; //获取最新的state
  queue.shared.pending = null; //将上一次的update置空

  if (pending != null) {
    const { memoizedState } = processUpdateQueue(hook.memoizedState, pending, currnetRenderLane);
    hook.memoizedState = memoizedState;
  }

  return [hook.memoizedState, queue.dispatch as Dispatch<State>]
}

//dispatchSetState: useState触发的dispatch    fiber: 当前的fiber, updateQueue: 当前hook的更新队列, action: 更新的操作
function dispatchSetState<State>(fiber: FiberNode, updateQueue: UpdateQueue<State>, action: Action<State>) {

  const lane = requestUpdateLane()  //创建lane优先级
  const update = createUpdate(action, lane);  //创建一个update
  enqueueUpdate(updateQueue, update); //将update插入到updateQueue中
  scheduleUpdateFiber(fiber, lane);   //触发更新流程
}

//获取在mount阶段时正在处理的hook
function mountWorkInProgressHook(): Hook {

  //1.在mount时我们要创建hook
  const hook: Hook = {
    memoizedState: null,
    next: null,
    updateQueue: null
  }

  if (workInProgressHook == null) {
    //在mount阶段并且是第一个hook
    if (currentlyRenderingFiber == null) {
      //说明hook不是在函数组件内执行的
      throw new Error("请在函数组件内调用hook")
    } else {
      //代表了这是mount时的第一个hook
      workInProgressHook = hook  //更新当前的hook为当前正在处理的hook
      currentlyRenderingFiber.memoizedState = workInProgressHook //更新memoizedState中hook数据
    }
  } else {
    //在mount阶段时第二个以下的hook
    workInProgressHook.next = hook;  //形成hook链表
    workInProgressHook = hook;    //更新当前的hook为当前正在处理的hook
  }

  return workInProgressHook;
}

//获取在mount阶段时正在处理的hook
function updateWorkInProgressHook(): Hook {
  //TODO render阶段触发的更新
  let nextCurrentHook: Hook | null   //用来保存下一个hook

  if (currentHook == null) {  //update阶段的第一个hook
    const current = currentlyRenderingFiber?.alternate;  //对应currntFiber

    if (current != null) {
      nextCurrentHook = current.memoizedState;
    } else {
      nextCurrentHook = null;
    }
  } else {  //update阶段后续的hook
    nextCurrentHook = currentHook.next;
  }


  currentHook = nextCurrentHook as Hook;

  if (nextCurrentHook == null) {  //两次执行的hook顺序的不同
    throw new Error("本次执行的hook顺序与上次不同")
  }

  const newHook: Hook = {
    memoizedState: currentHook.memoizedState,
    updateQueue: currentHook.updateQueue,
    next: null
  }

  if (workInProgressHook == null) {
    //update阶段的第一个hook
    if (currentlyRenderingFiber == null) {
      throw new Error("请在函数式组件内调用hook")
    } else {
      workInProgressHook = newHook;
      currentlyRenderingFiber.memoizedState = workInProgressHook;
    }
  } else {
    //update阶段后续的hook
    workInProgressHook.next = newHook;
    workInProgressHook = newHook;
  }
  return workInProgressHook;
}