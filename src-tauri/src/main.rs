// このファイルは薄いエントリポイントのみ。実装は lib.rs 側に置く
// (Tauri v2の標準構成: モバイルビルドではlibが直接使われ、
//  デスクトップビルドではこのmain.rsがバイナリのentryになる)

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ai_ensemble_lib::run();
}
