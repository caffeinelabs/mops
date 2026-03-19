mod utils;
mod wasm_utils;

use candid_parser::utils::{service_compatible, CandidSource};
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

#[wasm_bindgen]
pub fn add_custom_sections(bytes: &[u8], custom_sections: JsValue) -> JsResult<Vec<u8>> {
    wasm_utils::add_custom_sections(bytes, js_value(custom_sections)?)
        .map_err(|e| JsError::new(&e.to_string()))
}
