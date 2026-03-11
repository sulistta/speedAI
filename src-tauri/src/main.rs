// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;

const WHATSAPP_WEB_URL: &str = "https://web.whatsapp.com/";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WhatsappActionResponse {
    status: String,
    detail: String,
    opened_url: String,
}

#[tauri::command]
fn execute_whatsapp_action(
    contact: String,
    message: String,
) -> Result<WhatsappActionResponse, String> {
    println!(
        "Preparing WhatsApp action for contact '{contact}' with message '{message}'"
    );

    webbrowser::open(WHATSAPP_WEB_URL)
        .map_err(|error| format!("Failed to open WhatsApp Web: {error}"))?;

    Ok(WhatsappActionResponse {
        status: "WhatsApp Web aberto".to_string(),
        detail: format!(
            "Fluxo MVP iniciado para {contact}. Mensagem preparada: \"{message}\". \
             Finalize a busca do contato e o envio no navegador."
        ),
        opened_url: WHATSAPP_WEB_URL.to_string(),
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![execute_whatsapp_action])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
