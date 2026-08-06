use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::io::{self, Read};
use walrus::ir::{self, BinaryOp, Instr, LoadKind, StoreKind, UnaryOp, Visitor};
use walrus::{Module, RawCustomSection};

pub const WASM_MAGIC_BYTES: &[u8] = &[0, 97, 115, 109];
pub const GZIPPED_WASM_MAGIC_BYTES: &[u8] = &[31, 139, 8];
pub const COMPLEXITY_REPORTING_THRESHOLD: usize = 750_000;

#[derive(Debug)]
pub enum Error {
    IO(std::io::Error),
    WasmParse(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::IO(e) => write!(f, "IO error: {}", e),
            Error::WasmParse(e) => write!(f, "WASM parse error: {}", e),
        }
    }
}

impl std::error::Error for Error {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomSection {
    pub name: String,
    pub data: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionComplexity {
    pub index: usize,
    pub name: Option<String>,
    pub complexity: usize,
    pub instruction_count: usize,
    pub breakdown: ComplexityBreakdown,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComplexityContribution {
    pub instruction_count: usize,
    pub complexity: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComplexityBreakdown {
    pub calls: ComplexityContribution,
    pub branches: ComplexityContribution,
    pub control_flow: ComplexityContribution,
    pub memory: ComplexityContribution,
    pub variable_access: ComplexityContribution,
    pub numeric: ComplexityContribution,
    pub table_and_references: ComplexityContribution,
    pub other: ComplexityContribution,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmComplexityAnalysis {
    pub max_complexity: usize,
    pub risky_functions: Vec<FunctionComplexity>,
}

pub fn add_custom_sections(
    bytes: &[u8],
    custom_sections: Vec<CustomSection>,
) -> Result<Vec<u8>, Error> {
    let mut module = parse_wasm(&bytes, false)?;
    for m in &custom_sections {
        module.customs.remove_raw(&m.name);
    }
    for m in custom_sections {
        module.customs.add(RawCustomSection {
            name: m.name,
            data: m.data.as_bytes().to_vec(),
        });
    }
    Ok(module.emit_wasm())
}

pub fn analyze_function_complexity(bytes: &[u8]) -> Result<WasmComplexityAnalysis, Error> {
    let module = parse_wasm(bytes, true)?;
    Ok(analyze_module_function_complexity(
        &module,
        COMPLEXITY_REPORTING_THRESHOLD,
    ))
}

fn analyze_module_function_complexity(module: &Module, limit: usize) -> WasmComplexityAnalysis {
    let mut max_complexity = 0;
    let mut risky_functions = Vec::new();

    for (id, function) in module.funcs.iter_local() {
        let mut visitor = ComplexityVisitor::default();
        ir::dfs_in_order(&mut visitor, function, function.entry_block());
        max_complexity = max_complexity.max(visitor.complexity);

        if visitor.complexity >= limit {
            risky_functions.push(FunctionComplexity {
                index: id.index(),
                name: module.funcs.get(id).name.clone(),
                complexity: visitor.complexity,
                instruction_count: function.size() as usize,
                breakdown: visitor.breakdown,
            });
        }
    }

    risky_functions.sort_unstable_by(|a, b| {
        b.complexity
            .cmp(&a.complexity)
            .then_with(|| a.index.cmp(&b.index))
    });

    WasmComplexityAnalysis {
        max_complexity,
        risky_functions,
    }
}

#[derive(Default)]
struct ComplexityVisitor {
    complexity: usize,
    breakdown: ComplexityBreakdown,
}

impl<'instr> Visitor<'instr> for ComplexityVisitor {
    fn visit_instr(&mut self, instr: &'instr Instr, _: &'instr ir::InstrLocId) {
        let complexity = instruction_complexity(instr);
        self.complexity = self.complexity.saturating_add(complexity);
        self.breakdown.record(instr, complexity);
    }
}

impl ComplexityBreakdown {
    fn record(&mut self, instr: &Instr, complexity: usize) {
        let contribution = match instr {
            Instr::Call(_) | Instr::CallIndirect(_) => &mut self.calls,
            Instr::Br(_) | Instr::BrIf(_) | Instr::BrTable(_) => &mut self.branches,
            Instr::Block(_) | Instr::Loop(_) | Instr::IfElse(_) => &mut self.control_flow,
            Instr::MemorySize(_)
            | Instr::MemoryGrow(_)
            | Instr::MemoryInit(_)
            | Instr::DataDrop(_)
            | Instr::MemoryCopy(_)
            | Instr::MemoryFill(_)
            | Instr::Load(_)
            | Instr::Store(_) => &mut self.memory,
            Instr::LocalGet(_)
            | Instr::LocalSet(_)
            | Instr::LocalTee(_)
            | Instr::GlobalGet(_)
            | Instr::GlobalSet(_) => &mut self.variable_access,
            Instr::Const(_) | Instr::TernOp(_) | Instr::Binop(_) | Instr::Unop(_) => {
                &mut self.numeric
            }
            Instr::TableGet(_)
            | Instr::TableSet(_)
            | Instr::TableGrow(_)
            | Instr::TableSize(_)
            | Instr::TableFill(_)
            | Instr::RefNull(_)
            | Instr::RefIsNull(_)
            | Instr::RefFunc(_) => &mut self.table_and_references,
            _ => &mut self.other,
        };
        contribution.instruction_count = contribution.instruction_count.saturating_add(1);
        contribution.complexity = contribution.complexity.saturating_add(complexity);
    }
}

// Mirrors the replica validator at commit
// 03b28a2753593fe08e7db1aa5ad664ab03ed0c26:
// https://github.com/dfinity/ic/blob/03b28a2753593fe08e7db1aa5ad664ab03ed0c26/rs/embedders/src/wasm_utils/validation.rs
// That validator rejects complexity strictly greater than 1,000,000.
fn instruction_complexity(instr: &Instr) -> usize {
    match instr {
        Instr::Block(_)
        | Instr::Loop(_)
        | Instr::IfElse(_)
        | Instr::Br(_)
        | Instr::BrIf(_)
        | Instr::BrTable(_)
        | Instr::Call(_)
        | Instr::CallIndirect(_)
        | Instr::MemoryGrow(_) => 50,
        Instr::TableGet(_) => 14,
        Instr::RefFunc(_) => 8,
        Instr::RefIsNull(_) => 6,
        Instr::Unop(unop) => unary_complexity(unop.op),
        Instr::Binop(binop) => binary_complexity(binop.op),
        Instr::MemoryCopy(_) => 4,
        Instr::MemoryFill(_) => 3,
        Instr::Load(load) if is_weighted_load(load.kind) => 3,
        Instr::GlobalGet(_) | Instr::Select(_) | Instr::MemorySize(_) => 2,
        Instr::Store(store) if is_weighted_store(store.kind) => 2,
        _ => 1,
    }
}

fn is_weighted_load(kind: LoadKind) -> bool {
    !kind.atomic() && !matches!(kind, LoadKind::V128)
}

fn is_weighted_store(kind: StoreKind) -> bool {
    !kind.atomic() && !matches!(kind, StoreKind::V128)
}

fn unary_complexity(op: UnaryOp) -> usize {
    use UnaryOp::*;
    match op {
        I32TruncSF32 | I32TruncUF32 | I32TruncSF64 | I32TruncUF64 | I64ExtendSI32
        | I64ExtendUI32 | I64TruncSF32 | I64TruncUF32 | I64TruncSF64 | I64TruncUF64
        | F32ConvertSI32 | F32ConvertUI32 | F32ConvertSI64 | F32ConvertUI64 | F32DemoteF64
        | F64ConvertSI32 | F64ConvertUI32 | F64ConvertSI64 | F64ConvertUI64 => 5,
        F32Neg | F32Abs | F64Neg | F64Abs => 4,
        I32TruncSSatF32 | I32TruncUSatF32 | I32TruncSSatF64 | I32TruncUSatF64 | I64TruncSSatF32
        | I64TruncUSatF32 | I64TruncSSatF64 | I64TruncUSatF64 => 3,
        I32Eqz | I64Eqz | I32Popcnt | I64Popcnt | F32Ceil | F64Ceil | F32Floor | F64Floor
        | F32Sqrt | F64Sqrt | F32Trunc | F64Trunc | I32ReinterpretF32 | I64ReinterpretF64
        | F32ReinterpretI32 | F64ReinterpretI64 | I32WrapI64 | I32Extend8S | I32Extend16S
        | I64Extend8S | I64Extend16S | I64Extend32S | F64PromoteF32 => 2,
        _ => 1,
    }
}

fn binary_complexity(op: BinaryOp) -> usize {
    use BinaryOp::*;
    match op {
        F32Copysign | F64Copysign | F64Eq | I32RemU | I32RemS | I64RemU | I64RemS | I32DivU
        | I32DivS | I64DivU | I64DivS => 3,
        I32Eq | I32Ne | I32LtS | I32LtU | I32GtS | I32GtU | I32LeS | I32LeU | I32GeS | I32GeU
        | I64Eq | I64Ne | I64LtS | I64LtU | I64GtS | I64GtU | I64LeS | I64LeU | I64GeS | I64GeU
        | F32Eq | F32Ne | F32Lt | F32Gt | F32Le | F32Ge | F64Ne | F64Lt | F64Gt | F64Le | F64Ge => {
            2
        }
        _ => 1,
    }
}

pub fn wasm_parser_config(keep_name_section: bool) -> walrus::ModuleConfig {
    let mut config = walrus::ModuleConfig::new();
    config.generate_name_section(keep_name_section);
    config.generate_producers_section(false);
    config
}

pub fn decompress(bytes: &[u8]) -> Result<Vec<u8>, std::io::Error> {
    let mut decoder = libflate::gzip::Decoder::new(bytes)?;
    let mut decoded_data = Vec::new();
    decoder.read_to_end(&mut decoded_data)?;
    Ok(decoded_data)
}

pub fn parse_wasm(bytes: &[u8], keep_name_section: bool) -> Result<Module, Error> {
    let wasm = if bytes.starts_with(WASM_MAGIC_BYTES) {
        Ok(Cow::Borrowed(bytes))
    } else if bytes.starts_with(GZIPPED_WASM_MAGIC_BYTES) {
        decompress(bytes).map(Cow::Owned)
    } else {
        Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Input must be either gzipped or uncompressed WASM.",
        ))
    }
    .map_err(Error::IO)?;
    let config = wasm_parser_config(keep_name_section);
    config
        .parse(&wasm)
        .map_err(|e| Error::WasmParse(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    // One local function containing `block`, `br 0`, and the required `end`s.
    const BLOCK_AND_BRANCH_WASM: &[u8] = &[
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03,
        0x02, 0x01, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x02, 0x40, 0x0c, 0x00, 0x0b, 0x0b,
    ];
    #[test]
    fn uses_ic_instruction_weights() {
        assert_eq!(
            instruction_complexity(&Instr::Binop(ir::Binop {
                op: BinaryOp::F64Eq
            })),
            3
        );
        assert_eq!(
            instruction_complexity(&Instr::Unop(ir::Unop {
                op: UnaryOp::I32TruncSF64
            })),
            5
        );
        assert_eq!(
            instruction_complexity(&Instr::Unop(ir::Unop {
                op: UnaryOp::F32Abs
            })),
            4
        );
        assert_eq!(
            instruction_complexity(&Instr::Unop(ir::Unop {
                op: UnaryOp::I64TruncUSatF32
            })),
            3
        );
        assert_eq!(
            instruction_complexity(&Instr::Unop(ir::Unop {
                op: UnaryOp::I32Eqz
            })),
            2
        );
        assert_eq!(
            instruction_complexity(&Instr::Binop(ir::Binop {
                op: BinaryOp::I32Add
            })),
            1
        );
    }

    #[test]
    fn reports_functions_over_the_limit_with_metrics() {
        let module = parse_wasm(BLOCK_AND_BRANCH_WASM, true).unwrap();
        let analysis = analyze_module_function_complexity(&module, 99);

        assert_eq!(analysis.max_complexity, 100);
        assert_eq!(
            analysis.risky_functions,
            vec![FunctionComplexity {
                index: 0,
                name: None,
                complexity: 100,
                instruction_count: 2,
                breakdown: ComplexityBreakdown {
                    branches: ComplexityContribution {
                        instruction_count: 1,
                        complexity: 50,
                    },
                    control_flow: ComplexityContribution {
                        instruction_count: 1,
                        complexity: 50,
                    },
                    ..ComplexityBreakdown::default()
                },
            }]
        );
        let breakdown = &analysis.risky_functions[0].breakdown;
        assert_eq!(
            breakdown.branches.complexity + breakdown.control_flow.complexity,
            analysis.risky_functions[0].complexity
        );
    }

    #[test]
    fn reports_functions_at_the_threshold() {
        let module = parse_wasm(BLOCK_AND_BRANCH_WASM, true).unwrap();
        let analysis = analyze_module_function_complexity(&module, 100);

        assert_eq!(analysis.risky_functions.len(), 1);
    }
}
