## v1.5.0 (2026-08-17)

## v1.5.0-a4+439c04b (2026-08-17)

### Refactor

- tidy Angular component structure and finish @shared alias adoption
- group backend ipc/services by feature domain

## v1.5.0-a3+2dbe444 (2026-08-16)

### Feat

- adicionar função de redimensionamento de arte para OPL e integrá-la no download de arte

## v1.5.0-a2+3fef0a5 (2026-08-16)

### Feat

- integrate libretro metadata and artwork sources

## v1.5.0-a1+9cfea12 (2026-08-16)

### Feat

- adicionar suporte para importação de imagens de disco PS2 com roteamento para pastas CD/DVD

## v1.5.0-a0+502040e (2026-08-15)

### Feat

- update pnpm workspace and IPC dialog handling

## v1.4.0 (2026-08-15)

### Feat

- atualizar configuração do fluxo de trabalho de build e adicionar suporte a versionamento com commitizen
- adicionar configuração de convenção de nomenclatura e tipos de arte padrão nas configurações
- adicionar lógica para salvar nome de arquivo para lançadores PS1
- adicionar @types/node como dependência de desenvolvimento e atualizar suas versões
- adicionar configuração de workflow de build para múltiplas plataformas
- details view for games and apps (#25)
- App list support enhancement (#22)
- **invalid**: auto-discover game IDs and old/new convention in bulk correction
- per-game 'Rename to convention…' on game cards
- bulk rename to old/new OPL naming convention
- support OPL's new naming convention (no GAMEID prefix)
- bulk 'Convert all PS2 ISOs to ZSO' in library menu
- homebrew APPS import and library display
- virtual memory card (VMC) management
- per-game OPL config (CFG) editor
- ISO to ZSO compression
- settings persistence, batch imports, auto-update, and cleanup
- add list view mode

### Fix

- atualizar versão do Node.js para 22 e ajustar configuração do pnpm
- **gamecard**: dropdown clipping + chrome z-index layering
- also remove the paired APPS launcher when deleting a PS1 game
- stop POPS launchers from showing in the Apps tab
- **new-convention**: rename to '<Title>.iso' instead of skipping rename
- clearer file-access errors on import
- dependency build fixed with bump to lucide-angular
- prevent window jumping to bottom when updating artwork
- ul-games display information and Cover; adjust gamecard component layout; add game sorting; upgrade lucide-angular for dev environment
- tests with new additions
- dependency build fixed with bump to lucide-angular

### Refactor

- simplificar a lógica de identificação de aplicativos PS1 e atualizar rótulos de sistema
- centralizar a resolução de caminhos de ativos com a função resolveAssetPath
- **logging**: structured main-process logger with verbose work tracing
