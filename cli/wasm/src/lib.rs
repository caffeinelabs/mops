mod utils;
mod wasm_utils;

use candid::types::TypeInner;
use candid_parser::{
    check_prog, parse_idl_args,
    utils::{service_compatible, CandidSource},
    IDLProg,
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

#[wasm_bindgen]
pub fn encode_candid_args(args: &str, interface: &str) -> JsResult<Vec<u8>> {
    encode_candid_args_inner(args, interface).map_err(|e| JsError::new(&e))
}

fn encode_candid_args_inner(args: &str, interface: &str) -> Result<Vec<u8>, String> {
    let ast = interface.parse::<IDLProg>().map_err(|e| e.to_string())?;
    let mut env = candid::TypeEnv::new();
    let actor = check_prog(&mut env, &ast)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Candid interface has no service".to_string())?;
    let init_types = match actor.as_ref() {
        TypeInner::Class(types, _) => types.as_slice(),
        _ => &[],
    };
    let args = parse_idl_args(args).map_err(|e| e.to_string())?;
    args.to_bytes_with_types(&env, init_types)
        .map_err(|e| e.to_string())
}

#[wasm_bindgen]
pub fn add_custom_sections(bytes: &[u8], custom_sections: JsValue) -> JsResult<Vec<u8>> {
    wasm_utils::add_custom_sections(bytes, js_value(custom_sections)?)
        .map_err(|e| JsError::new(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use candid::{Encode, Nat};

    #[test]
    fn encodes_candid_constructor_args() {
        let interface = "service : (nat, text) -> { greet : () -> (text) query }";
        let encoded = encode_candid_args(r#"(42, "Motoko")"#, interface).unwrap();
        let expected = Encode!(&Nat::from(42_u8), &"Motoko").unwrap();

        assert_eq!(encoded, expected);
    }

    #[test]
    fn encodes_empty_args_for_service_without_constructor() {
        let interface = "service : { ping : () -> () }";
        let encoded = encode_candid_args("()", interface).unwrap();
        let expected = Encode!().unwrap();

        assert_eq!(encoded, expected);
    }

    #[test]
    fn rejects_interface_without_service() {
        let error = encode_candid_args_inner("()", "type Value = nat").unwrap_err();

        assert_eq!(error, "Candid interface has no service");
    }

    #[test]
    fn rejects_constructor_arity_mismatch() {
        let interface = "service : (nat) -> { ping : () -> () }";
        let error = encode_candid_args_inner("()", interface).unwrap_err();

        assert_eq!(error, "wrong number of argument values");
    }
}
