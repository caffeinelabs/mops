use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::io::{self, Read};
use walrus::{Module, RawCustomSection};

pub const WASM_MAGIC_BYTES: &[u8] = &[0, 97, 115, 109];
pub const GZIPPED_WASM_MAGIC_BYTES: &[u8] = &[31, 139, 8];

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
