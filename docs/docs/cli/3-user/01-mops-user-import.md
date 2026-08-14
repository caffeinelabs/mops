---
slug: /cli/mops-user-import
sidebar_label: mops user import
---

# `mops user import`

Import `.pem` file data to use as identity.

```
mops user import -- <pem_data>
```

To be able to publish packages to the `mops` registry, you need to import an existing identity.

:::note
This command accepts PEM file contents, not a path to a file.
:::

Supported keys are secp256k1 and Ed25519, in SEC1 (`-----BEGIN EC PRIVATE KEY-----`) or PKCS#8 (`-----BEGIN PRIVATE KEY-----`) format. This covers identities exported by `dfx` and `icp-cli`.

### `--no-encrypt`

Do not ask for a password to encrypt the identity. The identity is stored unencrypted, so commands that use it never prompt for a password — useful in CI and scripts.

```
mops user import --no-encrypt -- <pem_data>
```

### Import an identity from `icp`

```
mops user import -- "$(icp identity export <identity_name>)"
```

`dfx identity export` produces the same PEM formats and works too, though mops itself does not use or require `dfx`.

### Example

1. Create a new identity named `mops`

```
icp identity new mops
```

2. Import it into `mops`

```
mops user import -- "$(icp identity export mops)"
```