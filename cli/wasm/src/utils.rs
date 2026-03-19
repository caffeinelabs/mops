#![allow(dead_code)]

use serde::{de::DeserializeOwned, Serialize};
use serde_wasm_bindgen::{from_value, to_value};
use wasm_bindgen::{JsError, JsValue};

pub type JsResult<T = JsValue> = Result<T, JsError>;

pub fn js_value<T: DeserializeOwned>(value: JsValue) -> Result<T, JsError> {
    from_value(value).map_err(|e| JsError::new(&format!("Deserialization error: {}", e)).into())
}

pub fn js_return<T: Serialize + ?Sized>(value: &T) -> JsResult {
    to_value(value).map_err(|e| JsError::new(&format!("Serialization error: {}", e)))
}
