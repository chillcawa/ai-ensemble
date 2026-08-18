use keyring::Entry;

const SERVICE: &str = "ai-ensemble";

// SERVICE名はKeychain Access(macOS)やCredential Manager(Windows)に表示される。
// 一度リリースしたら変更しない — 変更すると既存ユーザーの保存済みキーが全部読めなくなる。

pub fn save_secret(provider: &str, value: &str) -> Result<(), String> {
    Entry::new(SERVICE, provider)
        .map_err(|e| format!("keyring entry error: {e}"))?
        .set_password(value)
        .map_err(|e| format!("failed to save to keyring: {e}"))
}

pub fn get_secret(provider: &str) -> Result<Option<String>, String> {
    match Entry::new(SERVICE, provider)
        .map_err(|e| format!("keyring entry error: {e}"))?
        .get_password()
    {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("failed to read from keyring: {e}")),
    }
}

pub fn delete_secret(provider: &str) -> Result<(), String> {
    match Entry::new(SERVICE, provider)
        .map_err(|e| format!("keyring entry error: {e}"))?
        .delete_credential()
    {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("failed to delete from keyring: {e}")),
    }
}
