export type Flags = number;

export const NoFlags = 0b000000000000;
export const Placement = 0b0000000001;
export const Update = 0b000000000010;
export const ChildDeletion = 0b000000000100;

export const PassiveEffect = 0b000000001000; //代表当前fiber节点中存在effect, 需要触发回调

export const MutationMark = Placement | Update | ChildDeletion //代表mutation阶段需要执行的操作

//如果我们当前subtreeFlag或flag中包含了MutationMark中指定的这些flag, 那就代表了当前我们需要执行Mutation这么一个子阶段

export const PassiveMask = PassiveEffect | ChildDeletion; //标志是否需要触发effect回调

