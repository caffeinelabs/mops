---
slug: /cli/mops-user-import
sidebar_label: mops user import
---

# `mops user import`

Import `.pem` file data to use as identity.

```
mops user import -- <pem_data>
```

To be able to publish a packages to the `mops` registry, you need to import an identity from DFX.

:::note
This command accepts PEM file contents, not a path to a file.
:::

Supported keys are secp256k1 and Ed25519, in SEC1 (`-----BEGIN EC PRIVATE KEY-----`) or PKCS#8 (`-----BEGIN PRIVATE KEY-----`) format. This covers identities exported by `dfx` and `icp-cli`.

### Import identity from DFX

```
mops user import -- "$(dfx identity export <identity_name>)"
```

### Example

1. Create new identity in DFX named `mops`

```
dfx identity new mops
```

2. Import identity into `mops`

```
mops user import -- "$(dfx identity export mops)"
```