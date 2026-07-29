mod utils;
mod wasm_utils;

use candid_parser::{
    bindings::motoko,
    pretty_parse,
    syntax::{IDLMergedProg, IDLProg},
    typing::check_prog,
    utils::{service_compatible, CandidSource},
    TypeEnv,
};
use wasm_bindgen::prelude::*;

use crate::utils::{js_value, JsResult};

#[wasm_bindgen]
pub fn is_candid_compatible(new_interface: &str, original_interface: &str) -> bool {
    service_compatible(
        CandidSource::Text(new_interface),
        CandidSource::Text(original_interface),
    )
    .is_ok()
}

/// Motoko bindings from a self-contained `.did` (imports not resolved).
#[wasm_bindgen]
pub fn bind_motoko(did: &str) -> JsResult<String> {
    let ast: IDLProg = pretty_parse("anonymous.did", did)
        .map_err(|e| JsError::new(&e.to_string()))?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).map_err(|e| JsError::new(&e.to_string()))?;
    let prog = IDLMergedProg::new(ast);
    Ok(motoko::compile(&env, &actor, &prog))
}

#[wasm_bindgen]
pub fn add_custom_sections(bytes: &[u8], custom_sections: JsValue) -> JsResult<Vec<u8>> {
    wasm_utils::add_custom_sections(bytes, js_value(custom_sections)?)
        .map_err(|e| JsError::new(&e.to_string()))
}
