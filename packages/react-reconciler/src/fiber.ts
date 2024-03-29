import { Props, Key, Ref, ReactElementType } from "shared/ReactTypes";
import { Fragment, FunctionComponent, HostComponent, WorkTag } from "./workTags";
import { Flags, NoFlags } from "./fiberFlags";
import { Container } from "hostConfig";
import { Lanes, Lane, NoLane, NoLanes } from "./fiberLanes";
import { Effect } from "./fiberHook";

export class FiberNode {
	type: any;
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	ref: Ref;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	memoizedProps: Props | null;
	memoizedState: any

	alternate: FiberNode | null;
	flags: Flags;
	subtreeFlags: Flags;

	updateQueue: unknown;
	deletions: FiberNode[] | null; //需要被删除节点的数组

	//pendingProps为需要改变的props, key为元素上的key
	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		this.tag = tag;
		this.key = key || null;
		this.stateNode = null;
		this.type = null;

		//构成树状结构
		this.return = null;
		this.sibling = null;
		this.child = null;
		this.index = 0;

		this.ref = null;

		//作为工作单元
		this.pendingProps = pendingProps;
		this.memoizedProps = null;
		this.memoizedState = null;
		this.updateQueue = null


		this.alternate = null;
		//副作用
		this.flags = NoFlags;
		this.subtreeFlags = NoFlags;
		this.deletions = null




	}
}

export interface PendingPassiveEffect {
	unmount: Effect[]  //unmount时effect的集合
	update: Effect[]   //update时effect的集合
}

export class FiberRootNode {
	container: Container;
	current: FiberNode;
	finishedWork: FiberNode | null;
	pendingLanes: Lanes; //所有未被消费的lane的集合
	finishedLane: Lane; //本次更新消费的lane
	pendingPassiveEffects: PendingPassiveEffect //收集effect集合
	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
		this.pendingLanes = NoLanes;
		this.finishedLane = NoLane;

		this.pendingPassiveEffects = {
			unmount: [],
			update: []
		}

	}
}

export const createWorkInProgress = (current: FiberNode, pendingProps: Props): FiberNode => {

	let wip = current.alternate;

	if (wip == null) {
		//mount
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.stateNode = current.stateNode;

		wip.alternate = current;
		current.alternate = wip
	} else {
		//update
		wip.pendingProps = pendingProps;
		wip.flags = NoFlags;
		wip.subtreeFlags = NoFlags;
		wip.deletions = null;

	}
	wip.type = current.type;
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;


	return wip;
}

//创建ReactElement元素
export function createFiberFromElement(element: ReactElementType): FiberNode {

	const { type, key, props } = element;
	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type == "string") {
		fiberTag = HostComponent
	} else if (typeof type != "function" && __DEV__) {
		console.warn("未定义的type类型", element)
	}

	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type
	return fiber;
}

//创建ReactFragment元素
export function createFiberFromFragment(elements: any[], key: Key) {
	return new FiberNode(Fragment, elements, key);  //创建Fragment类型的节点
}

//从FiberRootNode中移除lane
export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.finishedLane &= ~lane;
}
