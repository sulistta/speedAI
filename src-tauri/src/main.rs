// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio},
    sync::Mutex,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const SIDECAR_READY_SIGNAL: &str = "READY";
const SIDECAR_SCRIPT_RELATIVE_PATH: &str = "scripts/web-agent-sidecar.ts";
const BROWSER_PROFILE_DIRECTORY: &str = "browser-profile";

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
    generated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserAgentActionResult {
    action: String,
    status: String,
    detail: String,
    snapshot: BrowserPageSnapshot,
}

#[derive(Debug, Deserialize)]
struct BrowserAgentResponseEnvelope {
    id: String,
    ok: bool,
    result: Option<BrowserAgentActionResult>,
    error: Option<String>,
}

#[derive(Default)]
struct BrowserAgentRuntime {
    process: Mutex<Option<BrowserAgentSidecar>>,
}

struct BrowserAgentSidecar {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl BrowserAgentSidecar {
    fn spawn(app: &AppHandle) -> Result<Self, String> {
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let script_path = repo_root.join(SIDECAR_SCRIPT_RELATIVE_PATH);

        if !script_path.exists() {
            return Err(format!(
                "Nao encontrei o sidecar de navegacao em {}.",
                script_path.display()
            ));
        }

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

        let mut child = Command::new("bun")
            .arg(&script_path)
            .current_dir(&repo_root)
            .env("SPEEDAI_BROWSER_PROFILE_DIR", &profile_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                format!(
                    "Falha ao iniciar o sidecar web com Bun: {error}. Verifique se o Bun esta instalado e se o app esta sendo executado a partir do repositorio."
                )
            })?;

        let stdin = child.stdin.take().ok_or_else(|| {
            "O sidecar web iniciou sem stdin disponivel para comandos.".to_string()
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            "O sidecar web iniciou sem stdout disponivel para respostas.".to_string()
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            "O sidecar web iniciou sem stderr disponivel para diagnostico.".to_string()
        })?;

        Self::spawn_stderr_logger(stderr);

        let mut stdout_reader = BufReader::new(stdout);
        let mut ready_line = String::new();

        let bytes_read = stdout_reader
            .read_line(&mut ready_line)
            .map_err(|error| format!("Falha ao aguardar o bootstrap do sidecar web: {error}"))?;

        if bytes_read == 0 || ready_line.trim() != SIDECAR_READY_SIGNAL {
            let _ = child.kill();

            return Err(format!(
                "O sidecar web nao confirmou inicializacao correta. Saida recebida: {}",
                ready_line.trim()
            ));
        }

        Ok(Self {
            child,
            stdin,
            stdout: stdout_reader,
        })
    }

    fn spawn_stderr_logger(stderr: ChildStderr) {
        thread::spawn(move || {
            let reader = BufReader::new(stderr);

            for line in reader.lines() {
                match line {
                    Ok(content) if !content.trim().is_empty() => {
                        eprintln!("[web-sidecar] {content}");
                    }
                    Ok(_) => {}
                    Err(error) => {
                        eprintln!("[web-sidecar] failed to read stderr: {error}");
                        break;
                    }
                }
            }
        });
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
        let serialized_request = serde_json::to_string(&payload).map_err(|error| {
            format!("Falha ao serializar a requisicao do sidecar web: {error}")
        })?;

        self.stdin
            .write_all(serialized_request.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .and_then(|_| self.stdin.flush())
            .map_err(|error| format!("Falha ao enviar a requisicao ao sidecar web: {error}"))?;

        let mut response_line = String::new();
        let bytes_read = self
            .stdout
            .read_line(&mut response_line)
            .map_err(|error| format!("Falha ao ler a resposta do sidecar web: {error}"))?;

        if bytes_read == 0 {
            return Err(
                "O sidecar web encerrou inesperadamente enquanto processava a requisicao."
                    .to_string(),
            );
        }

        let response: BrowserAgentResponseEnvelope =
            serde_json::from_str(response_line.trim()).map_err(|error| {
                format!(
                    "Falha ao interpretar a resposta do sidecar web: {error}. Conteudo: {}",
                    response_line.trim()
                )
            })?;

        if response.id != request_id {
            return Err(
                "O sidecar web respondeu fora de ordem e a sessao ficou inconsistente."
                    .to_string(),
            );
        }

        if response.ok {
            response.result.ok_or_else(|| {
                "O sidecar web confirmou sucesso, mas nao retornou payload utilizavel."
                    .to_string()
            })
        } else {
            Err(response.error.unwrap_or_else(|| {
                "O sidecar web falhou sem devolver detalhes adicionais.".to_string()
            }))
        }
    }

    fn kill(mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
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

#[tauri::command]
fn execute_browser_agent_action(
    app: AppHandle,
    runtime: State<'_, BrowserAgentRuntime>,
    request: BrowserAgentRequest,
) -> Result<BrowserAgentActionResult, String> {
    runtime.execute(&app, request)
}

#[tauri::command]
fn reset_browser_agent_session(
    runtime: State<'_, BrowserAgentRuntime>,
) -> Result<(), String> {
    runtime.reset()
}

fn main() {
    tauri::Builder::default()
        .manage(BrowserAgentRuntime::default())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            execute_browser_agent_action,
            reset_browser_agent_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
