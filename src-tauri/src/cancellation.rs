//! cancellation.rs
//!
//! [Phase 1継続 項目4] Rust側でのストリーミングリクエストの真のキャンセル管理。
//!
//! これまでの修正(orchestrator.tsのタイムアウト)はJS側が「待つのをやめる」処理であり、
//! Rust側のHTTPリクエスト自体は裏で動き続けていた。本モジュールは、
//! request_idごとにCancellationTokenを発行・登録し、ユーザーが明示的に
//! 「このAIだけ停止」を押した場合に、実際にHTTP接続を中断する。
//!
//! 実装方針:
//! - `tokio::select!`でプロバイダのstream呼び出しとtoken.cancelled()を競合させる。
//! - 負けた側(cancelされた場合)のfutureはtokio::select!によってdropされ、
//!   reqwestの進行中のstream/接続もそれに伴って中断される。
//! - registryはTauriの managed state として持ち、全command間で共有する。

use std::collections::HashMap;
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct StreamCancellationRegistry(Mutex<HashMap<String, CancellationToken>>);

impl StreamCancellationRegistry {
    /// 新規streamの開始時に呼ぶ。登録したtokenを返す。
    /// 呼び出し側は、stream終了時(成功/失敗/キャンセルいずれでも)に
    /// 必ず`unregister`を呼び、registryにtokenが残り続けないようにする。
    pub fn register(&self, request_id: &str) -> CancellationToken {
        let token = CancellationToken::new();
        let mut map = self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        map.insert(request_id.to_string(), token.clone());
        token
    }

    pub fn unregister(&self, request_id: &str) {
        let mut map = self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        map.remove(request_id);
    }

    /// UIの「このAIだけ停止」ボタンから呼ばれる。該当request_idのtokenを
    /// キャンセルする。既に完了・存在しないrequest_idの場合は
    /// エラーにせず黙って無視する(タイミング上、キャンセル要求がstream完了と
    /// 競合するのは正常なケースのため)。
    pub fn cancel(&self, request_id: &str) {
        let map = self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(token) = map.get(request_id) {
            token.cancel();
        }
    }
}
