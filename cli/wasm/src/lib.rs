mod utils;
mod wasm_utils;

use candid::types::TypeInner;
use candid_parser::{
    check_prog, parse_idl_args,
    utils::{service_compatible, CandidSource},
    IDLProg,
};
use wasm_bindgen::prelude::*;

use crate::utils::{js_return, JsResult};

/// Why `new_interface` is not a subtype of `original_interface`, or `None` when it is.
#[wasm_bindgen]
pub fn check_candid_compatibility(new_interface: &str, original_interface: &str) -> Option<String> {
    service_compatible(
        CandidSource::Text(new_interface),
        CandidSource::Text(original_interface),
    )
    .err()
    .map(|e| format!("{e:#}"))
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

/// Functions whose estimated IC0505 complexity is at least `threshold`.
#[wasm_bindgen]
pub fn analyze_wasm_function_complexity(bytes: &[u8], threshold: usize) -> JsResult {
    let analysis =
        wasm_utils::analyze_function_complexity(bytes, threshold).map_err(|e| JsError::new(&e))?;
    js_return(&analysis)
}

#[cfg(test)]
mod tests {
    use super::*;
    use candid::{Encode, Nat};

    #[test]
    fn explains_candid_incompatibility() {
        let original = "service : { greet : () -> (text) query }";
        assert_eq!(check_candid_compatibility(original, original), None);
        let error = check_candid_compatibility("service : {}", original).unwrap();
        assert!(error.contains("greet"), "unexpected error: {}", error);
    }

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

        // Owned by candid_parser — assert the substance, not the exact wording.
        assert!(
            error.contains("number of argument"),
            "unexpected error: {}",
            error
        );
    }
}
