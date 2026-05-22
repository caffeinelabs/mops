import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface BenchResult {
  'rts_stable_memory_size' : bigint,
  'stable_memory_size' : bigint,
  'instructions' : bigint,
  'rts_memory_size' : bigint,
  'rts_total_allocation' : bigint,
  'rts_collector_instructions' : bigint,
  'rts_mutator_instructions' : bigint,
  'rts_logical_stable_memory_size' : bigint,
  'rts_heap_size' : bigint,
  'rts_reclaimed' : bigint,
}
export interface BenchSchema {
  'cols' : Array<string>,
  'name' : string,
  'rows' : Array<string>,
  'description' : string,
}
export interface _anon_class_13_1 {
  'getSchema' : ActorMethod<[], BenchSchema>,
  'getStats' : ActorMethod<[], BenchResult>,
  'init' : ActorMethod<[], BenchSchema>,
  'runCellQuery' : ActorMethod<[bigint, bigint], BenchResult>,
  'runCellUpdate' : ActorMethod<[bigint, bigint], BenchResult>,
  'runCellUpdateAwait' : ActorMethod<[bigint, bigint], BenchResult>,
}
export interface _SERVICE extends _anon_class_13_1 {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
