from __future__ import annotations

import json
import os
import queue
import subprocess
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config" / "tiktok-bot.json"
RUNTIME_DIR = ROOT / ".runtime"
STATUS_PATH = RUNTIME_DIR / "tiktok-bot.status.json"
COMMAND_PATH = RUNTIME_DIR / "tiktok-bot.command.json"
START_SCRIPT = ROOT / "INICIAR_TIKTOK_BOT.ps1"

ACTIONS = (
    ("scroll", "Assistir / rolar vídeos"),
    ("like", "Curtir"),
    ("comment", "Comentar"),
    ("follow", "Seguir"),
    ("share", "Compartilhar painel"),
)


class TikTokBotPanel(tk.Tk):
    def __init__(self) -> None:
        super().__init__()

        self.title("TikTok Bot - Android / Appium")
        self.geometry("1220x820")
        self.minsize(1060, 700)

        self.process: subprocess.Popen[str] | None = None
        self.output_queue: queue.Queue[str] = queue.Queue()
        self.seen_logs: set[str] = set()
        self._last_status_mtime = 0.0
        self._closing = False

        self.action_vars: dict[str, dict[str, tk.Variable]] = {}

        self._build_style()
        self._build_variables()
        self._build_ui()
        self.load_config()
        self.after(200, self._drain_output_queue)
        self.after(600, self._poll_status)
        self.after(1000, self.refresh_connections)

        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_style(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        self.configure(bg="#10131a")
        style.configure(".", font=("Segoe UI", 10))
        style.configure("TFrame", background="#10131a")
        style.configure("Card.TFrame", background="#171c26")
        style.configure("TLabel", background="#10131a", foreground="#e8ecf3")
        style.configure("Card.TLabel", background="#171c26", foreground="#e8ecf3")
        style.configure("Title.TLabel", background="#10131a", foreground="#ffffff", font=("Segoe UI Semibold", 18))
        style.configure("Muted.TLabel", background="#171c26", foreground="#9ca8bb")
        style.configure("Status.TLabel", background="#171c26", foreground="#7bd88f", font=("Segoe UI Semibold", 11))
        style.configure("TCheckbutton", background="#171c26", foreground="#e8ecf3")
        style.configure("TLabelframe", background="#171c26", foreground="#e8ecf3")
        style.configure("TLabelframe.Label", background="#171c26", foreground="#e8ecf3", font=("Segoe UI Semibold", 10))
        style.configure("TNotebook", background="#10131a", borderwidth=0)
        style.configure("TNotebook.Tab", padding=(14, 8))
        style.map("TNotebook.Tab", background=[("selected", "#252d3c")], foreground=[("selected", "#ffffff")])

    def _build_variables(self) -> None:
        self.bot_state = tk.StringVar(value="stopped")
        self.bot_mode = tk.StringVar(value="-")
        self.device_state = tk.StringVar(value="Verificando...")
        self.appium_state = tk.StringVar(value="Verificando...")
        self.current_action = tk.StringVar(value="-")
        self.last_action = tk.StringVar(value="-")
        self.next_action = tk.StringVar(value="-")
        self.last_error = tk.StringVar(value="-")
        self.core_state = tk.StringVar(value="stopped")
        self.core_tick = tk.StringVar(value="inativo")
        self.core_last_tick = tk.StringVar(value="-")
        self.core_result = tk.StringVar(value="-")

        self.min_delay = tk.StringVar(value="60")
        self.max_per_hour = tk.StringVar(value="10")
        self.pause_errors = tk.StringVar(value="2")
        self.pause_minutes = tk.StringVar(value="5")
        self.weekday_start = tk.StringVar(value="0")
        self.weekday_end = tk.StringVar(value="24")
        self.weekend_start = tk.StringVar(value="0")
        self.weekend_end = tk.StringVar(value="24")
        self.warmup_seconds = tk.StringVar(value="")

        self.language = tk.StringVar(value="pt-BR")
        self.tone = tk.StringVar(value="Natural, amigável e relevante")
        self.topics = tk.StringVar(value="tecnologia, produtos, dicas")
        self.max_length = tk.StringVar(value="120")

        self.core_enabled = tk.BooleanVar(value=True)
        self.followback_hours = tk.StringVar(value="48")
        self.hashtag_enabled = tk.BooleanVar(value=False)
        self.hashtag_include = tk.StringVar(value="")
        self.hashtag_exclude = tk.StringVar(value="")
        self.hashtag_mode = tk.StringVar(value="any")
        self.hashtag_max = tk.StringVar(value="20")

        self.stat_vars = {
            "scrolls": tk.StringVar(value="0"),
            "likes": tk.StringVar(value="0"),
            "comments": tk.StringVar(value="0"),
            "follows": tk.StringVar(value="0"),
            "shares": tk.StringVar(value="0"),
            "errors": tk.StringVar(value="0"),
            "totalActions": tk.StringVar(value="0"),
            "actionsThisHour": tk.StringVar(value="0"),
        }

    def _build_ui(self) -> None:
        root = ttk.Frame(self)
        root.pack(fill="both", expand=True, padx=16, pady=14)

        header = ttk.Frame(root)
        header.pack(fill="x")

        ttk.Label(header, text="TikTok Bot", style="Title.TLabel").pack(side="left")
        ttk.Label(
            header,
            text="Android real • Appium/ADB • painel standalone",
            foreground="#9ca8bb",
        ).pack(side="left", padx=(14, 0), pady=(5, 0))

        ttk.Button(header, text="Salvar configuração", command=self.save_config).pack(side="right")

        status_strip = ttk.Frame(root, style="Card.TFrame")
        status_strip.pack(fill="x", pady=(12, 10))

        self._status_item(status_strip, "BOT", self.bot_state, 0)
        self._status_item(status_strip, "MODO", self.bot_mode, 1)
        self._status_item(status_strip, "CELULAR / ADB", self.device_state, 2)
        self._status_item(status_strip, "APPIUM", self.appium_state, 3)
        self._status_item(status_strip, "CORE", self.core_state, 4)

        controls = ttk.Frame(root, style="Card.TFrame")
        controls.pack(fill="x", pady=(0, 10), ipady=7)

        ttk.Button(controls, text="▶ Iniciar TESTE", command=lambda: self.start_bot("test")).pack(side="left", padx=(10, 6))
        ttk.Button(controls, text="▶ Iniciar REAL", command=lambda: self.start_bot("real")).pack(side="left", padx=6)
        ttk.Button(controls, text="⏸ Pausar", command=lambda: self.send_command("pause")).pack(side="left", padx=6)
        ttk.Button(controls, text="▶ Retomar", command=lambda: self.send_command("resume")).pack(side="left", padx=6)
        ttk.Button(controls, text="■ Parar", command=lambda: self.send_command("stop")).pack(side="left", padx=6)
        ttk.Button(controls, text="↻ Atualizar conexões", command=self.refresh_connections).pack(side="right", padx=10)

        notebook = ttk.Notebook(root)
        notebook.pack(fill="both", expand=True)

        self.tab_control = ttk.Frame(notebook, style="Card.TFrame")
        self.tab_actions = ttk.Frame(notebook, style="Card.TFrame")
        self.tab_config = ttk.Frame(notebook, style="Card.TFrame")
        self.tab_automation = ttk.Frame(notebook, style="Card.TFrame")

        notebook.add(self.tab_control, text="Controle e logs")
        notebook.add(self.tab_actions, text="Ações")
        notebook.add(self.tab_config, text="Conteúdo e limites")
        notebook.add(self.tab_automation, text="Follow-back e hashtags")

        self._build_control_tab()
        self._build_actions_tab()
        self._build_config_tab()
        self._build_automation_tab()

    def _status_item(self, parent: ttk.Frame, title: str, variable: tk.StringVar, column: int) -> None:
        frame = ttk.Frame(parent, style="Card.TFrame")
        frame.grid(row=0, column=column, sticky="nsew", padx=12, pady=8)
        parent.columnconfigure(column, weight=1)
        ttk.Label(frame, text=title, style="Muted.TLabel").pack(anchor="w")
        ttk.Label(frame, textvariable=variable, style="Status.TLabel").pack(anchor="w", pady=(2, 0))

    def _build_control_tab(self) -> None:
        self.tab_control.columnconfigure(0, weight=1)
        self.tab_control.columnconfigure(1, weight=1)
        self.tab_control.rowconfigure(2, weight=1)

        runtime = ttk.LabelFrame(self.tab_control, text="Execução")
        runtime.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)

        labels = (
            ("Ação atual", self.current_action),
            ("Última ação", self.last_action),
            ("Próxima ação", self.next_action),
            ("Último erro", self.last_error),
        )
        for row, (title, var) in enumerate(labels):
            ttk.Label(runtime, text=title, style="Muted.TLabel").grid(row=row, column=0, sticky="w", padx=10, pady=5)
            ttk.Label(runtime, textvariable=var, style="Card.TLabel").grid(row=row, column=1, sticky="w", padx=10, pady=5)

        core = ttk.LabelFrame(self.tab_control, text="Automation Core / follow-back")
        core.grid(row=0, column=1, sticky="nsew", padx=10, pady=10)

        core_labels = (
            ("Estado", self.core_state),
            ("Tick", self.core_tick),
            ("Último tick", self.core_last_tick),
            ("Resultado", self.core_result),
        )
        for row, (title, var) in enumerate(core_labels):
            ttk.Label(core, text=title, style="Muted.TLabel").grid(row=row, column=0, sticky="w", padx=10, pady=5)
            ttk.Label(core, textvariable=var, style="Card.TLabel").grid(row=row, column=1, sticky="w", padx=10, pady=5)

        stats = ttk.LabelFrame(self.tab_control, text="Contadores")
        stats.grid(row=1, column=0, columnspan=2, sticky="ew", padx=10, pady=(0, 10))

        stat_titles = (
            ("Vídeos/scroll", "scrolls"),
            ("Curtidas", "likes"),
            ("Comentários", "comments"),
            ("Seguidos", "follows"),
            ("Shares", "shares"),
            ("Erros", "errors"),
            ("Total", "totalActions"),
            ("Nesta hora", "actionsThisHour"),
        )
        for idx, (title, key) in enumerate(stat_titles):
            col = idx % 4
            row = (idx // 4) * 2
            ttk.Label(stats, text=title, style="Muted.TLabel").grid(row=row, column=col, sticky="w", padx=12, pady=(7, 0))
            ttk.Label(stats, textvariable=self.stat_vars[key], style="Card.TLabel").grid(row=row + 1, column=col, sticky="w", padx=12, pady=(0, 7))
            stats.columnconfigure(col, weight=1)

        logs_frame = ttk.LabelFrame(self.tab_control, text="Logs ao vivo")
        logs_frame.grid(row=2, column=0, columnspan=2, sticky="nsew", padx=10, pady=(0, 10))
        logs_frame.rowconfigure(0, weight=1)
        logs_frame.columnconfigure(0, weight=1)

        self.logs_text = tk.Text(
            logs_frame,
            bg="#0b0e14",
            fg="#d7deea",
            insertbackground="#ffffff",
            relief="flat",
            wrap="word",
            font=("Cascadia Mono", 9),
        )
        self.logs_text.grid(row=0, column=0, sticky="nsew", padx=(8, 0), pady=8)
        scroll = ttk.Scrollbar(logs_frame, orient="vertical", command=self.logs_text.yview)
        scroll.grid(row=0, column=1, sticky="ns", pady=8, padx=(0, 8))
        self.logs_text.configure(yscrollcommand=scroll.set)

    def _build_actions_tab(self) -> None:
        ttk.Label(
            self.tab_actions,
            text="Escolha as ações do bot e seus limites individuais.",
            style="Card.TLabel",
        ).pack(anchor="w", padx=14, pady=(14, 8))

        table = ttk.Frame(self.tab_actions, style="Card.TFrame")
        table.pack(fill="x", padx=14, pady=6)

        headers = ("Ação", "Ativa", "Intervalo (min)", "Limite diário")
        for col, title in enumerate(headers):
            ttk.Label(table, text=title, style="Muted.TLabel").grid(row=0, column=col, sticky="w", padx=8, pady=6)

        for row, (key, label) in enumerate(ACTIONS, start=1):
            enabled = tk.BooleanVar(value=False)
            interval = tk.StringVar(value="1")
            daily = tk.StringVar(value="20")

            self.action_vars[key] = {
                "enabled": enabled,
                "intervalMinutes": interval,
                "dailyLimit": daily,
            }

            ttk.Label(table, text=label, style="Card.TLabel").grid(row=row, column=0, sticky="w", padx=8, pady=7)
            ttk.Checkbutton(table, variable=enabled).grid(row=row, column=1, sticky="w", padx=8)
            ttk.Entry(table, textvariable=interval, width=14).grid(row=row, column=2, sticky="w", padx=8)
            ttk.Entry(table, textvariable=daily, width=14).grid(row=row, column=3, sticky="w", padx=8)

        ttk.Label(
            self.tab_actions,
            text=(
                "No modo TESTE, curtidas/comentários/follows são simulados. "
                "No modo REAL, as ações habilitadas são executadas no aparelho."
            ),
            style="Muted.TLabel",
            wraplength=900,
        ).pack(anchor="w", padx=14, pady=16)

    def _build_config_tab(self) -> None:
        outer = ttk.Frame(self.tab_config, style="Card.TFrame")
        outer.pack(fill="both", expand=True, padx=12, pady=12)
        outer.columnconfigure(0, weight=1)
        outer.columnconfigure(1, weight=1)

        safety = ttk.LabelFrame(outer, text="Segurança e ritmo")
        safety.grid(row=0, column=0, sticky="nsew", padx=6, pady=6)

        self._entry_row(safety, 0, "Delay mínimo global (s)", self.min_delay)
        self._entry_row(safety, 1, "Máximo de ações/hora", self.max_per_hour)
        self._entry_row(safety, 2, "Pausar após N erros", self.pause_errors)
        self._entry_row(safety, 3, "Pausa por erro (min)", self.pause_minutes)
        self._entry_row(safety, 4, "Warmup (s, vazio = padrão)", self.warmup_seconds)

        hours = ttk.LabelFrame(outer, text="Horário ativo")
        hours.grid(row=1, column=0, sticky="nsew", padx=6, pady=6)
        self._entry_row(hours, 0, "Seg-Sex início", self.weekday_start)
        self._entry_row(hours, 1, "Seg-Sex fim", self.weekday_end)
        self._entry_row(hours, 2, "Fim de semana início", self.weekend_start)
        self._entry_row(hours, 3, "Fim de semana fim", self.weekend_end)

        content = ttk.LabelFrame(outer, text="Comentários automáticos")
        content.grid(row=0, column=1, rowspan=2, sticky="nsew", padx=6, pady=6)
        self._entry_row(content, 0, "Idioma", self.language)
        self._entry_row(content, 1, "Tom", self.tone)
        self._entry_row(content, 2, "Tópicos (vírgula)", self.topics)
        self._entry_row(content, 3, "Máx. caracteres", self.max_length)

        ttk.Label(
            content,
            text=(
                "Os comentários usam o provedor de IA configurado no .env. "
                "Se a geração falhar, a ação é registrada como erro."
            ),
            style="Muted.TLabel",
            wraplength=420,
        ).grid(row=4, column=0, columnspan=2, sticky="w", padx=10, pady=12)

    def _build_automation_tab(self) -> None:
        core = ttk.LabelFrame(self.tab_automation, text="Follow-back / relacionamento")
        core.pack(fill="x", padx=14, pady=(14, 8))

        ttk.Checkbutton(core, text="Ativar Automation Core", variable=self.core_enabled).grid(row=0, column=0, columnspan=2, sticky="w", padx=10, pady=8)
        self._entry_row(core, 1, "Checar follow-back após (horas)", self.followback_hours)

        ttk.Label(
            core,
            text=(
                "Quando um FOLLOW real é confirmado, o bot registra a conta e agenda a checagem. "
                "Se não houver follow-back, UNFOLLOW entra somente em revisão manual; "
                "o scheduler não executa unfollow automaticamente."
            ),
            style="Muted.TLabel",
            wraplength=920,
        ).grid(row=2, column=0, columnspan=2, sticky="w", padx=10, pady=(4, 10))

        hashtag = ttk.LabelFrame(self.tab_automation, text="Filtros por hashtag")
        hashtag.pack(fill="x", padx=14, pady=8)

        ttk.Checkbutton(hashtag, text="Ativar filtro de descoberta", variable=self.hashtag_enabled).grid(row=0, column=0, columnspan=2, sticky="w", padx=10, pady=8)
        self._entry_row(hashtag, 1, "Incluir hashtags (vírgula)", self.hashtag_include)
        self._entry_row(hashtag, 2, "Excluir hashtags (vírgula)", self.hashtag_exclude)

        ttk.Label(hashtag, text="Regra de inclusão", style="Muted.TLabel").grid(row=3, column=0, sticky="w", padx=10, pady=6)
        ttk.Combobox(
            hashtag,
            textvariable=self.hashtag_mode,
            values=("any", "all"),
            state="readonly",
            width=18,
        ).grid(row=3, column=1, sticky="w", padx=10, pady=6)
        self._entry_row(hashtag, 4, "Máx. candidatos/ciclo", self.hashtag_max)

        ttk.Label(
            hashtag,
            text=(
                "ANY = basta uma hashtag incluída. ALL = todas as hashtags incluídas precisam estar presentes. "
                "Hashtags excluídas sempre rejeitam o candidato."
            ),
            style="Muted.TLabel",
            wraplength=920,
        ).grid(row=5, column=0, columnspan=2, sticky="w", padx=10, pady=(4, 10))

    def _entry_row(self, parent: ttk.Widget, row: int, label: str, variable: tk.StringVar) -> None:
        ttk.Label(parent, text=label, style="Muted.TLabel").grid(row=row, column=0, sticky="w", padx=10, pady=6)
        ttk.Entry(parent, textvariable=variable, width=28).grid(row=row, column=1, sticky="ew", padx=10, pady=6)
        parent.columnconfigure(1, weight=1)

    @staticmethod
    def _csv(value: str) -> list[str]:
        return [item.strip().lstrip("#") for item in value.split(",") if item.strip()]

    @staticmethod
    def _int(value: str, name: str, minimum: int, maximum: int | None = None) -> int:
        try:
            number = int(value)
        except ValueError as exc:
            raise ValueError(f"{name}: informe um número inteiro.") from exc

        if number < minimum:
            raise ValueError(f"{name}: mínimo {minimum}.")

        if maximum is not None and number > maximum:
            raise ValueError(f"{name}: máximo {maximum}.")

        return number

    def load_config(self) -> None:
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            messagebox.showerror("Configuração", f"Não foi possível abrir {CONFIG_PATH}\n\n{exc}")
            return

        for key, _ in ACTIONS:
            action = data.get("actions", {}).get(key, {})
            vars_ = self.action_vars.get(key)
            if vars_:
                vars_["enabled"].set(bool(action.get("enabled", False)))
                vars_["intervalMinutes"].set(str(action.get("intervalMinutes", 1)))
                vars_["dailyLimit"].set(str(action.get("dailyLimit", 20)))

        safety = data.get("safety", {})
        self.min_delay.set(str(safety.get("minDelaySeconds", 60)))
        self.max_per_hour.set(str(safety.get("maxActionsPerHour", 10)))
        self.pause_errors.set(str(safety.get("pauseOnErrorCount", 2)))
        self.pause_minutes.set(str(safety.get("pauseDurationMinutes", 5)))

        warmup = data.get("warmupSeconds")
        self.warmup_seconds.set("" if warmup is None else str(warmup))

        hours = data.get("activeHours", {})
        weekday = hours.get("weekday", {})
        weekend = hours.get("weekend", {})
        self.weekday_start.set(str(weekday.get("start", 0)))
        self.weekday_end.set(str(weekday.get("end", 24)))
        self.weekend_start.set(str(weekend.get("start", 0)))
        self.weekend_end.set(str(weekend.get("end", 24)))

        content = data.get("content", {})
        self.language.set(str(content.get("language", "pt-BR")))
        self.tone.set(str(content.get("tone", "Natural, amigável e relevante")))
        self.topics.set(", ".join(content.get("topics", ["tecnologia", "produtos", "dicas"])))
        self.max_length.set(str(content.get("maxLength", 120)))

        auto = data.get("automationCore", {})
        self.core_enabled.set(bool(auto.get("enabled", True)))
        self.followback_hours.set(str(auto.get("followBackCheckHours", 48)))
        hashtags = auto.get("hashtags", {})
        self.hashtag_enabled.set(bool(hashtags.get("enabled", False)))
        self.hashtag_include.set(", ".join(hashtags.get("include", [])))
        self.hashtag_exclude.set(", ".join(hashtags.get("exclude", [])))
        self.hashtag_mode.set(str(hashtags.get("matchMode", "any")))
        self.hashtag_max.set(str(hashtags.get("maxCandidatesPerCycle", 20)))

    def save_config(self, quiet: bool = False) -> bool:
        try:
            if CONFIG_PATH.exists():
                data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            else:
                data = {}

            actions: dict[str, dict[str, object]] = {}
            enabled_count = 0

            for key, _ in ACTIONS:
                vars_ = self.action_vars[key]
                enabled = bool(vars_["enabled"].get())
                if enabled:
                    enabled_count += 1

                actions[key] = {
                    "enabled": enabled,
                    "intervalMinutes": self._int(str(vars_["intervalMinutes"].get()), f"{key} intervalo", 1),
                    "dailyLimit": self._int(str(vars_["dailyLimit"].get()), f"{key} limite diário", 0),
                }

            if enabled_count == 0:
                raise ValueError("Ative pelo menos uma ação.")

            data["actions"] = actions
            data["safety"] = {
                "minDelaySeconds": self._int(self.min_delay.get(), "Delay mínimo", 1),
                "maxActionsPerHour": self._int(self.max_per_hour.get(), "Máximo por hora", 1),
                "pauseOnErrorCount": self._int(self.pause_errors.get(), "Erros antes da pausa", 1),
                "pauseDurationMinutes": self._int(self.pause_minutes.get(), "Pausa por erro", 1),
            }
            data["activeHours"] = {
                "weekday": {
                    "start": self._int(self.weekday_start.get(), "Seg-Sex início", 0, 23),
                    "end": self._int(self.weekday_end.get(), "Seg-Sex fim", 1, 24),
                },
                "weekend": {
                    "start": self._int(self.weekend_start.get(), "Fim de semana início", 0, 23),
                    "end": self._int(self.weekend_end.get(), "Fim de semana fim", 1, 24),
                },
            }

            if data["activeHours"]["weekday"]["start"] >= data["activeHours"]["weekday"]["end"]:
                raise ValueError("Seg-Sex: o horário inicial deve ser menor que o final.")

            if data["activeHours"]["weekend"]["start"] >= data["activeHours"]["weekend"]["end"]:
                raise ValueError("Fim de semana: o horário inicial deve ser menor que o final.")

            topics = self._csv(self.topics.get())
            if not topics:
                raise ValueError("Informe pelo menos um tópico para comentários.")

            data["content"] = {
                "tone": self.tone.get().strip() or "Natural, amigável e relevante",
                "language": self.language.get().strip() or "pt-BR",
                "topics": topics,
                "maxLength": self._int(self.max_length.get(), "Máx. caracteres", 20, 500),
            }

            warm = self.warmup_seconds.get().strip()
            if warm:
                data["warmupSeconds"] = self._int(warm, "Warmup", 0)
            else:
                data.pop("warmupSeconds", None)

            data["automationCore"] = {
                "enabled": bool(self.core_enabled.get()),
                "followBackCheckHours": self._int(self.followback_hours.get(), "Follow-back (horas)", 1, 24 * 30),
                "hashtags": {
                    "enabled": bool(self.hashtag_enabled.get()),
                    "include": self._csv(self.hashtag_include.get()),
                    "exclude": self._csv(self.hashtag_exclude.get()),
                    "matchMode": self.hashtag_mode.get() if self.hashtag_mode.get() in ("any", "all") else "any",
                    "maxCandidatesPerCycle": self._int(self.hashtag_max.get(), "Máx. candidatos", 1, 100),
                },
            }

            CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
            temp = CONFIG_PATH.with_suffix(".json.tmp")
            temp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            temp.replace(CONFIG_PATH)

            if not quiet:
                messagebox.showinfo("Configuração", "Configuração salva.")
            return True
        except Exception as exc:
            messagebox.showerror("Configuração inválida", str(exc))
            return False

    def start_bot(self, mode: str) -> None:
        if self.process and self.process.poll() is None:
            messagebox.showwarning("TikTok Bot", "O bot já está em execução.")
            return

        if not self.save_config(quiet=True):
            return

        if mode == "real":
            confirmed = messagebox.askyesno(
                "Modo REAL",
                "No modo REAL, curtidas, comentários e follows habilitados alteram a conta do TikTok.\n\nDeseja iniciar?",
            )
            if not confirmed:
                return

        switch = "-Real" if mode == "real" else "-Test"
        command = [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(START_SCRIPT),
            switch,
        ]

        try:
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            self.process = subprocess.Popen(
                command,
                cwd=str(ROOT),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                creationflags=flags,
            )
        except Exception as exc:
            messagebox.showerror("TikTok Bot", f"Falha ao iniciar:\n\n{exc}")
            return

        self._append_log(f"[PAINEL] Iniciando modo {mode.upper()}...")

        thread = threading.Thread(target=self._read_process_output, daemon=True)
        thread.start()

    def _read_process_output(self) -> None:
        process = self.process
        if not process or not process.stdout:
            return

        for line in process.stdout:
            self.output_queue.put(line.rstrip())

        code = process.wait()
        self.output_queue.put(f"[PAINEL] Processo finalizado com exit code {code}.")

    def _drain_output_queue(self) -> None:
        try:
            while True:
                line = self.output_queue.get_nowait()
                self._append_log(line)
        except queue.Empty:
            pass

        if not self._closing:
            self.after(200, self._drain_output_queue)

    def _append_log(self, text: str) -> None:
        stamp = time.strftime("%H:%M:%S")
        self.logs_text.insert("end", f"[{stamp}] {text}\n")
        self.logs_text.see("end")

        lines = int(self.logs_text.index("end-1c").split(".")[0])
        if lines > 1200:
            self.logs_text.delete("1.0", "200.0")

    def send_command(self, command: str) -> None:
        RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

        payload = {
            "command": command,
            "requestedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "source": "python-panel",
        }

        temp = COMMAND_PATH.with_suffix(".tmp")
        temp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        temp.replace(COMMAND_PATH)

        self._append_log(f"[PAINEL] Comando enviado: {command}")

    def _poll_status(self) -> None:
        try:
            if STATUS_PATH.exists():
                mtime = STATUS_PATH.stat().st_mtime
                if mtime != self._last_status_mtime:
                    self._last_status_mtime = mtime
                    self._read_status()
            else:
                self.bot_state.set("stopped")
        except Exception as exc:
            self._append_log(f"[PAINEL] Falha ao ler status: {exc}")

        if not self._closing:
            self.after(1000, self._poll_status)

    def _read_status(self) -> None:
        data = json.loads(STATUS_PATH.read_text(encoding="utf-8"))

        self.bot_state.set(str(data.get("state", "stopped")))
        self.bot_mode.set(str(data.get("mode", "-")).upper())
        self.current_action.set(str(data.get("currentAction") or "-"))
        self.last_action.set(str(data.get("lastAction") or "-"))
        self.next_action.set(str(data.get("nextActionTime") or "-"))
        self.last_error.set(str(data.get("lastError") or "-"))

        stats = data.get("stats", {})
        for key, variable in self.stat_vars.items():
            variable.set(str(stats.get(key, 0)))

        core = data.get("automationCore", {})
        self.core_state.set(str(core.get("state", "stopped")))
        self.core_tick.set("ativo" if core.get("tickActive") else "inativo")
        self.core_last_tick.set(str(core.get("lastRunCompletedAt") or core.get("lastRunStartedAt") or "-"))

        result = core.get("lastResult")
        if isinstance(result, dict):
            self.core_result.set(
                "scanned={scanned} processed={processed} ok={succeeded} failed={failed}".format(
                    scanned=result.get("scanned", 0),
                    processed=result.get("processed", 0),
                    succeeded=result.get("succeeded", 0),
                    failed=result.get("failed", 0),
                )
            )
        else:
            self.core_result.set("-")

        device = str(data.get("deviceId") or "-")
        if device != "-":
            self.device_state.set(device)

        for entry in data.get("logs", []):
            if not isinstance(entry, dict):
                continue
            key = "|".join(
                str(entry.get(part, ""))
                for part in ("timestamp", "action", "status", "message")
            )
            if key in self.seen_logs:
                continue

            self.seen_logs.add(key)
            timestamp = str(entry.get("timestamp", ""))
            action = str(entry.get("action", ""))
            status = str(entry.get("status", ""))
            message = str(entry.get("message", ""))
            self._append_log(f"{timestamp} [{action}/{status}] {message}")

    def refresh_connections(self) -> None:
        def worker() -> None:
            device_text = "não encontrado"
            appium_text = "offline"

            try:
                out = subprocess.check_output(
                    ["adb", "devices"],
                    cwd=str(ROOT),
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=5,
                )
                devices = []
                for line in out.splitlines()[1:]:
                    parts = line.split()
                    if len(parts) >= 2 and parts[1] == "device":
                        devices.append(parts[0])
                if devices:
                    device_text = ", ".join(devices)
            except Exception:
                device_text = "ADB indisponível"

            try:
                config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
                url = str(config.get("appiumUrl", "http://127.0.0.1:4723")).rstrip("/") + "/status"
                with urlopen(url, timeout=3) as response:
                    if 200 <= response.status < 300:
                        appium_text = "online"
            except Exception:
                appium_text = "offline"

            self.after(0, lambda: self.device_state.set(device_text))
            self.after(0, lambda: self.appium_state.set(appium_text))

        threading.Thread(target=worker, daemon=True).start()

    def _on_close(self) -> None:
        state = self.bot_state.get().lower()

        if state in ("running", "paused"):
            answer = messagebox.askyesnocancel(
                "Fechar painel",
                "O bot está ativo.\n\nSim = parar o bot e fechar\nNão = manter o bot rodando e fechar o painel\nCancelar = voltar",
            )

            if answer is None:
                return

            if answer:
                self.send_command("stop")

        self._closing = True
        self.destroy()


if __name__ == "__main__":
    app = TikTokBotPanel()
    app.mainloop()
