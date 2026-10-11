# Acessibilidade

## Auditoria de 11/10/2026

Ferramenta: axe-core 4.x (regras WCAG 2.0/2.1 A e AA e boas práticas),
rodada no navegador sobre o sistema já montado, logado como administrador.

Telas conferidas:
- **Escritório:** entrar, Início, Agenda, Mensagens, Clientes, ficha do
  cliente, importar clientes, Prazos, Tarefas, Processos, Entrevistas,
  Modelos, Primeiros passos, Minha conta, Integrações, Administração,
  Equipe, Busca.
- **Públicas:** site, Planos, Cadastro, Termos, Privacidade.

### O que foi encontrado e corrigido

| Problema | Onde | Correção |
| --- | --- | --- |
| Texto cinza (slate-500) a 4,4:1 sobre o fundo da página; o mínimo é 4,5:1 | quase todas as telas | slate-500 um degrau mais escuro (`#5d6b7f`, 5:1) em `tailwind.config.ts` |
| Texto cinza-claro (slate-400) a 2,4:1 | "opcional", números de passo, campos riscados | trocado por slate-500 (fica slate-400 só sobre fundo escuro) |
| Sobretítulo na cor de destaque do escritório (ouro) a 2:1 | cartões e seções | nova cor derivada `--marca-secundaria-texto`: a mesma cor escurecida até 4,5:1 (`textoLegivelSobre` em `identidade.ts`); filete, barra e selo continuam na cor original |
| Dois menus laterais sem nome que os distinga | todas as telas do escritório | `aria-label` "Menu principal" e "Menu principal no celular" |
| Barra de busca fora de qualquer região da página | todas as telas do escritório | virou `<header>` |
| Navegação do site repetida sem nome | site público | `aria-label` em cada `<nav>` |
| Coluna de ações com cabeçalho vazio | agenda, importação, implantação | texto "Acoes" só para leitor de tela |
| Campo de arquivo sem rótulo | importar clientes | `aria-label` |
| Título pulando de nível (h1 → h3) | Planos | h2 |

### O que fica, e por quê

- O "JUD" dourado do logotipo BirdJud: texto de logotipo não tem exigência de
  contraste (WCAG 1.4.3, exceção para logotipos).

### O que esta auditoria não cobre

- Teste com leitor de tela de verdade (NVDA, VoiceOver) e navegação só por
  teclado em fluxo completo. A ferramenta automática pega em torno de metade
  dos problemas reais.
- O console da plataforma (`/plataforma`), que é ferramenta interna da
  Blackbird.

### Para repetir

Com o sistema rodando (`npm run build && npx next start`), injetar
`node_modules/axe-core/axe.min.js` na página pelo Playwright e chamar
`axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] })`.
O teste `testes/identidade.test.ts` garante que qualquer cor de destaque
gere texto legível.
