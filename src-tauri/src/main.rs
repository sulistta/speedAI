// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use reqwest::blocking::{Client, Response};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    async_runtime::{block_on as block_on_task, Receiver},
    AppHandle, Manager, State,
};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

const SIDECAR_READY_SIGNAL: &str = "READY";
const SIDECAR_BINARY_NAME: &str = "web-agent-sidecar";
const BROWSER_PROFILE_DIRECTORY: &str = "browser-profile";
const BROWSER_RESOURCES_DIRECTORY: &str = "web-agent-browser";
const BROWSER_MANIFEST_FILE: &str = "web-agent-browser-manifest.json";
const MODAL_CHAT_COMPLETIONS_URL: &str = "https://api.us-west-2.modal.direct/v1/chat/completions";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserAgentRequest {
    action: String,
    url: Option<String>,
    target_id: Option<String>,
    text: Option<String>,
    submit: Option<bool>,
    key: Option<String>,
    timeout_ms: Option<u32>,
    direction: Option<String>,
    amount: Option<u32>,
    snapshot_mode: Option<String>,
    focus_text: Option<String>,
    url_includes: Option<String>,
    minimum_change: Option<u32>,
    wait_for_text: Option<String>,
    wait_for_url: Option<String>,
    visual_overlay_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
struct BrowserAgentRequestEnvelope {
    id: String,
    #[serde(flatten)]
    request: BrowserAgentRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserSnapshotHeading {
    tag: String,
    text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserSnapshotRegion {
    tag: String,
    label: Option<String>,
    text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserSnapshotElement {
    target_id: String,
    tag: String,
    role: Option<String>,
    #[serde(rename = "type")]
    input_type: Option<String>,
    text: String,
    label: Option<String>,
    placeholder: Option<String>,
    href: Option<String>,
    disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserPageSnapshot {
    title: String,
    url: String,
    headings: Vec<BrowserSnapshotHeading>,
    regions: Vec<BrowserSnapshotRegion>,
    elements: Vec<BrowserSnapshotElement>,
    mode: String,
    focus_text: Option<String>,
    generated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserAgentReadiness {
    state: String,
    detail: String,
    url_changed: bool,
    content_changed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserAgentMetrics {
    action_duration_ms: u32,
    settle_duration_ms: u32,
    snapshot_duration_ms: u32,
    snapshot_bytes: u32,
    snapshot_mode: String,
    snapshot_element_count: u32,
    snapshot_heading_count: u32,
    snapshot_region_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserAgentActionResult {
    action: String,
    status: String,
    detail: String,
    snapshot: BrowserPageSnapshot,
    readiness: BrowserAgentReadiness,
    metrics: BrowserAgentMetrics,
    highlighted_target_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BrowserAgentResponseEnvelope {
    id: String,
    ok: bool,
    result: Option<BrowserAgentActionResult>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserBundleManifest {
    bundle_directory: String,
    executable_relative_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModalToolFunction {
    name: String,
    arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModalToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: ModalToolFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModalChatMessage {
    role: String,
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<ModalToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModalToolDefinitionFunction {
    name: String,
    description: String,
    parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModalToolDefinition {
    #[serde(rename = "type")]
    tool_type: String,
    function: ModalToolDefinitionFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModalThinkingConfig {
    #[serde(rename = "type")]
    thinking_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModalChatCompletionRequest {
    api_key: String,
    model: String,
    messages: Vec<ModalChatMessage>,
    tools: Vec<ModalToolDefinition>,
    tool_choice: String,
    thinking_enabled: bool,
    temperature: f64,
    max_tokens: u32,
}

#[derive(Debug, Clone, Serialize)]
struct ModalChatCompletionApiRequest {
    model: String,
    messages: Vec<ModalChatMessage>,
    tools: Vec<ModalToolDefinition>,
    tool_choice: String,
    thinking: ModalThinkingConfig,
    temperature: f64,
    max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModalChatCompletionChoice {
    finish_reason: Option<String>,
    message: Option<ModalChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModalChatCompletionError {
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModalChatCompletionResponse {
    choices: Option<Vec<ModalChatCompletionChoice>>,
    error: Option<ModalChatCompletionError>,
}

#[derive(Clone, Default)]
struct BrowserAgentRuntime {
    process: Arc<Mutex<Option<BrowserAgentSidecar>>>,
}

struct BrowserAgentSidecar {
    child: CommandChild,
    receiver: Receiver<CommandEvent>,
}

impl BrowserAgentSidecar {
    fn spawn(app: &AppHandle) -> Result<Self, String> {
        let profile_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| {
                format!("Nao foi possivel resolver o diretorio de dados do app: {error}")
            })?
            .join(BROWSER_PROFILE_DIRECTORY);

        fs::create_dir_all(&profile_dir).map_err(|error| {
            format!(
                "Nao foi possivel criar o diretorio de perfil do navegador em {}: {error}",
                profile_dir.display()
            )
        })?;

        let browser_executable_path = resolve_browser_executable_path(app)?;

        let (mut receiver, child) = app
            .shell()
            .sidecar(SIDECAR_BINARY_NAME)
            .map_err(|error| format!("Falha ao preparar o sidecar web empacotado: {error}"))?
            .env("SPEEDAI_BROWSER_PROFILE_DIR", &profile_dir)
            .env("SPEEDAI_BROWSER_EXECUTABLE_PATH", &browser_executable_path)
            .spawn()
            .map_err(|error| format!("Falha ao iniciar o sidecar web empacotado: {error}"))?;

        Self::wait_until_ready(&mut receiver)?;

        Ok(Self { child, receiver })
    }

    fn wait_until_ready(receiver: &mut Receiver<CommandEvent>) -> Result<(), String> {
        loop {
            match read_sidecar_event(receiver, "a inicializacao do sidecar web")? {
                CommandEvent::Stdout(line) => {
                    let content = String::from_utf8_lossy(&line);
                    let trimmed = content.trim();

                    if trimmed.is_empty() {
                        continue;
                    }

                    if trimmed == SIDECAR_READY_SIGNAL {
                        return Ok(());
                    }

                    return Err(format!(
                        "O sidecar web nao confirmou inicializacao correta. Saida recebida: {trimmed}"
                    ));
                }
                CommandEvent::Stderr(line) => log_sidecar_stderr(&line),
                CommandEvent::Error(error) => {
                    return Err(format!(
                        "O sidecar web reportou um erro durante a inicializacao: {error}"
                    ));
                }
                CommandEvent::Terminated(payload) => {
                    return Err(format!(
                        "O sidecar web encerrou durante a inicializacao (codigo: {:?}, sinal: {:?}).",
                        payload.code, payload.signal
                    ));
                }
                _ => {}
            }
        }
    }

    fn send_request(
        &mut self,
        request: &BrowserAgentRequest,
    ) -> Result<BrowserAgentActionResult, String> {
        let request_id = format!(
            "{}-{}",
            request.action,
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|error| format!("Falha ao gerar request ID do sidecar: {error}"))?
                .as_millis()
        );
        let payload = BrowserAgentRequestEnvelope {
            id: request_id.clone(),
            request: request.clone(),
        };
        let serialized_request = serde_json::to_string(&payload)
            .map_err(|error| format!("Falha ao serializar a requisicao do sidecar web: {error}"))?;

        let mut request_payload = serialized_request.into_bytes();
        request_payload.push(b'\n');

        self.child
            .write(&request_payload)
            .map_err(|error| format!("Falha ao enviar a requisicao ao sidecar web: {error}"))?;

        let response_line = self.read_response_line()?;

        let response: BrowserAgentResponseEnvelope =
            serde_json::from_str(&response_line).map_err(|error| {
                format!(
                    "Falha ao interpretar a resposta do sidecar web: {error}. Conteudo: {}",
                    response_line
                )
            })?;

        if response.id != request_id {
            return Err(
                "O sidecar web respondeu fora de ordem e a sessao ficou inconsistente.".to_string(),
            );
        }

        if response.ok {
            response.result.ok_or_else(|| {
                "O sidecar web confirmou sucesso, mas nao retornou payload utilizavel.".to_string()
            })
        } else {
            Err(response.error.unwrap_or_else(|| {
                "O sidecar web falhou sem devolver detalhes adicionais.".to_string()
            }))
        }
    }

    fn read_response_line(&mut self) -> Result<String, String> {
        loop {
            match read_sidecar_event(&mut self.receiver, "a execucao da requisicao web")? {
                CommandEvent::Stdout(line) => {
                    let content = String::from_utf8_lossy(&line);
                    let trimmed = content.trim();

                    if trimmed.is_empty() {
                        continue;
                    }

                    return Ok(trimmed.to_string());
                }
                CommandEvent::Stderr(line) => log_sidecar_stderr(&line),
                CommandEvent::Error(error) => {
                    return Err(format!(
                        "O sidecar web reportou um erro ao processar a requisicao: {error}"
                    ));
                }
                CommandEvent::Terminated(payload) => {
                    return Err(format!(
                        "O sidecar web encerrou inesperadamente enquanto processava a requisicao (codigo: {:?}, sinal: {:?}).",
                        payload.code, payload.signal
                    ));
                }
                _ => {}
            }
        }
    }

    fn kill(self) {
        let _ = self.child.kill();
    }
}

impl BrowserAgentRuntime {
    fn execute(
        &self,
        app: &AppHandle,
        request: BrowserAgentRequest,
    ) -> Result<BrowserAgentActionResult, String> {
        let mut guard = self
            .process
            .lock()
            .map_err(|_| "Nao foi possivel obter acesso exclusivo ao sidecar web.".to_string())?;

        for attempt in 0..2 {
            if guard.is_none() {
                *guard = Some(BrowserAgentSidecar::spawn(app)?);
            }

            let Some(sidecar) = guard.as_mut() else {
                return Err("O sidecar web nao esta disponivel para processamento.".to_string());
            };

            match sidecar.send_request(&request) {
                Ok(result) => return Ok(result),
                Err(error) => {
                    eprintln!("[web-sidecar] request failed: {error}");

                    if let Some(sidecar) = guard.take() {
                        sidecar.kill();
                    }

                    if attempt == 1 {
                        return Err(error);
                    }
                }
            }
        }

        Err("Nao foi possivel restabelecer a sessao do sidecar web.".to_string())
    }

    fn reset(&self) -> Result<(), String> {
        let mut guard = self
            .process
            .lock()
            .map_err(|_| "Nao foi possivel obter acesso exclusivo ao sidecar web.".to_string())?;

        if let Some(sidecar) = guard.take() {
            sidecar.kill();
        }

        Ok(())
    }
}

fn log_sidecar_stderr(line: &[u8]) {
    let content = String::from_utf8_lossy(line);
    let trimmed = content.trim();

    if !trimmed.is_empty() {
        eprintln!("[web-sidecar] {trimmed}");
    }
}

fn read_sidecar_event(
    receiver: &mut Receiver<CommandEvent>,
    operation: &str,
) -> Result<CommandEvent, String> {
    block_on_task(receiver.recv())
        .ok_or_else(|| format!("O sidecar web encerrou inesperadamente durante {operation}."))
}

fn resolve_browser_executable_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(configured_path) = std::env::var("SPEEDAI_BROWSER_EXECUTABLE_PATH") {
        let trimmed_path = configured_path.trim();

        if !trimmed_path.is_empty() {
            let executable_path = PathBuf::from(trimmed_path);

            if executable_path.exists() {
                return Ok(executable_path);
            }

            return Err(format!(
                "O executavel configurado em SPEEDAI_BROWSER_EXECUTABLE_PATH nao existe em {}.",
                executable_path.display()
            ));
        }
    }

    for manifest_path in candidate_browser_manifest_paths(app) {
        if !manifest_path.exists() {
            continue;
        }

        let manifest_content = fs::read_to_string(&manifest_path).map_err(|error| {
            format!(
                "Falha ao ler o manifest do navegador empacotado em {}: {error}",
                manifest_path.display()
            )
        })?;
        let manifest: BrowserBundleManifest =
            serde_json::from_str(&manifest_content).map_err(|error| {
                format!(
                    "Falha ao interpretar o manifest do navegador empacotado em {}: {error}",
                    manifest_path.display()
                )
            })?;

        let manifest_parent = manifest_path.parent().ok_or_else(|| {
            format!(
                "O manifest do navegador empacotado em {} nao possui diretorio pai.",
                manifest_path.display()
            )
        })?;
        let executable_path = manifest_parent
            .join(BROWSER_RESOURCES_DIRECTORY)
            .join(manifest.bundle_directory)
            .join(portable_relative_path_to_pathbuf(
                &manifest.executable_relative_path,
            ));

        if executable_path.exists() {
            return Ok(executable_path);
        }

        return Err(format!(
            "O navegador empacotado foi descrito em {}, mas o executavel nao existe em {}.",
            manifest_path.display(),
            executable_path.display()
        ));
    }

    Err(
        "Nao encontrei um navegador empacotado para a automacao web. Rode \"bun run prepare:web-agent\" antes de iniciar ou empacotar o app."
            .to_string(),
    )
}

fn candidate_browser_manifest_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        paths.push(resource_dir.join(BROWSER_MANIFEST_FILE));
    }

    paths.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(BROWSER_MANIFEST_FILE),
    );

    paths
}

fn portable_relative_path_to_pathbuf(relative_path: &str) -> PathBuf {
    let mut resolved_path = PathBuf::new();

    for segment in relative_path.split('/') {
        if !segment.is_empty() {
            resolved_path.push(segment);
        }
    }

    resolved_path
}

fn build_modal_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("Falha ao criar o cliente HTTP do Modal: {error}"))
}

fn read_modal_error(response: Response) -> String {
    let status = response.status();
    let body = response
        .text()
        .unwrap_or_else(|_| "sem corpo de resposta".to_string());

    if let Ok(parsed_body) = serde_json::from_str::<ModalChatCompletionResponse>(&body) {
        if let Some(message) = parsed_body.error.and_then(|error| error.message) {
            if !message.trim().is_empty() {
                return message;
            }
        }
    }

    let trimmed_body = body.trim();

    if trimmed_body.is_empty() {
        format!("Modal respondeu com HTTP {status} sem detalhes adicionais.")
    } else {
        format!("Modal respondeu com HTTP {status}: {trimmed_body}")
    }
}

async fn run_blocking_task<T, F>(operation: &'static str, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("Falha ao aguardar {operation}: {error}"))?
}

#[tauri::command]
async fn execute_browser_agent_action(
    app: AppHandle,
    runtime: State<'_, BrowserAgentRuntime>,
    request: BrowserAgentRequest,
) -> Result<BrowserAgentActionResult, String> {
    let runtime = runtime.inner().clone();

    run_blocking_task("a execucao da acao web", move || {
        runtime.execute(&app, request)
    })
    .await
}

#[tauri::command]
async fn reset_browser_agent_session(
    runtime: State<'_, BrowserAgentRuntime>,
) -> Result<(), String> {
    let runtime = runtime.inner().clone();

    run_blocking_task("o reset da sessao web", move || runtime.reset()).await
}

fn execute_modal_chat_completion_blocking(
    request: ModalChatCompletionRequest,
) -> Result<ModalChatCompletionResponse, String> {
    if request.api_key.trim().is_empty() {
        return Err("Salve sua API Key do Modal antes de executar comandos.".to_string());
    }

    if request.model.trim().is_empty() {
        return Err("Selecione um modelo do Modal antes de executar comandos.".to_string());
    }

    let client = build_modal_client()?;
    let response = client
        .post(MODAL_CHAT_COMPLETIONS_URL)
        .bearer_auth(request.api_key.trim())
        .json(&ModalChatCompletionApiRequest {
            model: request.model,
            messages: request.messages,
            tools: request.tools,
            tool_choice: request.tool_choice,
            thinking: ModalThinkingConfig {
                thinking_type: if request.thinking_enabled {
                    "enabled".to_string()
                } else {
                    "disabled".to_string()
                },
            },
            temperature: request.temperature,
            max_tokens: request.max_tokens,
        })
        .send()
        .map_err(|error| format!("Falha ao conversar com o Modal: {error}"))?;

    if !response.status().is_success() {
        return Err(read_modal_error(response));
    }

    response
        .json::<ModalChatCompletionResponse>()
        .map_err(|error| format!("Falha ao interpretar a resposta do Modal: {error}"))
}

#[tauri::command]
async fn execute_modal_chat_completion(
    request: ModalChatCompletionRequest,
) -> Result<ModalChatCompletionResponse, String> {
    run_blocking_task("a resposta do Modal", move || {
        execute_modal_chat_completion_blocking(request)
    })
    .await
}

fn main() {
    tauri::Builder::default()
        .manage(BrowserAgentRuntime::default())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            execute_browser_agent_action,
            reset_browser_agent_session,
            execute_modal_chat_completion
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
