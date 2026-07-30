# gather-bots

[![CI](https://github.com/Jbnado/gather-bots/actions/workflows/ci.yml/badge.svg)](https://github.com/Jbnado/gather-bots/actions/workflows/ci.yml)

Alimenta os Smart Objects do [Gather](https://gather.town) com o seu trabalho de verdade — PRs
esperando por você, pipelines que quebraram, tarefas em andamento, reuniões prestes a começar.
Sua mesa no escritório virtual conta o que está acontecendo sem ninguém abrir outra aba.

*[Read in English](README.md)*

```
INBOX          [8]  o que espera por mim
                    PR #101 · corrige cálculo de frete
                    Bug · Doing · arredondamento nas notas

BOT STATUS   alert   o que roda sem mim
                    svc-orders · main   ← pipeline vermelha

LIGHTBULB      off   pode me interromper?
                    "Em reunião: Weekly"
```

**Nada que você não configurar roda.** Um objeto e uma integração já é um sistema útil. Acrescente
o resto quando quiser; o que não estiver configurado fica quieto, desligado.

## Começando

Você precisa de **Node 24 ou mais novo** (exigência do SDK do Gather) e **pnpm**. Se a máquina tem
Node antigo e você não pode trocar no sistema, um gerenciador de versão resolve localmente:

```bash
fnm install 24 && fnm use 24      # ou: nvm install 24 && nvm use 24
npm install -g pnpm               # se ainda não tiver pnpm
```

Depois:

```bash
git clone git@github.com:Jbnado/gather-bots.git
cd gather-bots
pnpm install
cp .env.example .env              # PowerShell: copy .env.example .env
pnpm checkup                      # diz exatamente o que preencher em seguida
```

`pnpm checkup` funciona **antes** de você configurar qualquer coisa — é justamente o objetivo. Ele
nunca falha por falta de configuração, só diz o que está faltando.

`pnpm checkup` é o comando pra rodar sempre que algo parecer errado. Ele classifica cada objeto e
cada integração em três estados:

| | significado |
|---|---|
| `✓` | funcionando |
| `○` | não configurado — normal, e mostra qual variável ligaria |
| `✗` | configurado e quebrado — a única linha que merece atenção |

Depois:

```bash
pnpm once     # uma passada e sai — bom pra conferir o que seria enviado
pnpm start    # fica rodando, a cada POLL_INTERVAL_SECONDS
```

## O que pode mostrar o quê

Objetos são colocados no Gather (Menu Principal → Decorar Mesa → Smart Objects). Cada um tem URL
de webhook e API key próprias, ambas no menu ⋮ do objeto.

| Objeto | Preset | Superfície padrão |
|---|---|---|
| Inbox | `inbox` | `inbox` — contagem e feed clicável do que precisa de você |
| Bot Status Monitor | `status` | `activity-monitor` — um símbolo pro que está rodando |
| Lightbulb | `switch` | `availability` — apagada enquanto você está em reunião |

**Superfície** é uma forma de ler seus sinais num objeto, e dá pra trocar:

```bash
GATHER_LIGHTBULB_SURFACE=prod-health   # acesa quando produção está quebrada
```

Disponíveis: `inbox`, `activity-monitor`, `availability`, `prod-health`.

## Integrações

| Integração | Dá | Setup |
|---|---|---|
| Azure DevOps — pull requests | reviews esperando por você, seus PRs parados | [guia](docs/integrations/azure-devops.md) |
| Azure DevOps — work items | tarefas nos estados que você escolher | [guia](docs/integrations/azure-devops.md) |
| Azure DevOps — pipelines | saúde das builds, prod e develop separados | [guia](docs/integrations/azure-devops.md) |
| Google Calendar | reuniões, convites não respondidos | [guia](docs/integrations/google-calendar.md) |
| Outlook / Microsoft 365 | o mesmo, num tenant Microsoft | [guia](docs/integrations/outlook.md) |

As duas agendas podem rodar juntas.

## Criando as suas

O núcleo não conhece Azure DevOps, Google, Microsoft — nem o Gather. Ports and adapters do começo
ao fim, então há três coisas que você pode acrescentar sem encostar no meio:

- **Uma fonte nova** (Jira, GitHub, Linear, PagerDuty): implemente `SignalSourcePort`, exporte um
  `Integration` e adicione uma linha em `src/integrations/index.ts`.
- **Uma superfície nova**: uma função pura de sinais pra snapshot, registrada em
  `src/objects/registry.ts`.
- **Um destino que não é o Gather**: implemente `SmartObjectPort` e todo o resto funciona — uma
  lâmpada Philips Hue, um status no Slack, uma fita de LED.

Detalhes em [CONTRIBUTING.md](CONTRIBUTING.md) (em inglês).

## Coisas que mordem

**O rate limit do Gather é por space, não por objeto.** O dispatcher compara com o último estado
enviado (`state/last-sent.json`) e manda só a diferença — um minuto sem novidade custa **zero**
requisições. Apagar esse arquivo força reenvio completo.

**`activity.clear` é proibido.** Um objeto carrega entradas de várias fontes; limpar apagaria as
das outras. O tipo `Command` omite o evento de propósito, então o compilador recusa.

**O feed é visível pra todos os Members e Guests do space.** Títulos de PR e de tarefa aparecem
pra qualquer pessoa na sala.

**Integração fora do ar não apaga seu feed.** O último resultado bom vale por até 15 minutos;
depois disso os itens somem, porque uma reunião que acabou há uma hora é pior que reunião nenhuma.
Se todas as fontes falharem de uma vez, nada é escrito — isso é queda de rede, não tudo acabando
ao mesmo tempo.

**Escrever num objeto por fora do pipeline dessincroniza o arquivo de estado.** Apague
`state/last-sent.json` depois de qualquer teste manual.

## Rodando continuamente

**Linux** — serviço systemd de usuário, sem root:

```bash
mkdir -p ~/.config/systemd/user
sed "s|__DIR__|$PWD|g; s|__PNPM__|$(command -v pnpm)|g" scripts/gather-bots.service \
  > ~/.config/systemd/user/gather-bots.service
systemctl --user daemon-reload
systemctl --user enable --now gather-bots

journalctl --user -u gather-bots -f    # acompanhar o log
```

Em máquina compartilhada ou sem sessão gráfica, `sudo loginctl enable-linger $USER` mantém
rodando mesmo com você deslogado.

**Windows** — `powershell -ExecutionPolicy Bypass -File scripts\install-task.ps1` registra uma
tarefa agendada que inicia no logon, sem precisar de admin.

**macOS** — qualquer supervisor serve, é um processo Node comum. O caminho mais curto é
`pm2 start pnpm --name gather-bots -- start`.

## Licença

MIT — veja [LICENSE](LICENSE).
