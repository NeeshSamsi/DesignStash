import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

// The app reaches a design-system primitive (src/renderer/src/ui/*) through its component in
// components/*, which maps Figma's props onto it and sets data-ds. Only the files below import a
// primitive, and each only the ones listed.
const RENDERER = 'src/renderer/src'
const UI_IMPORTS = {
  // Each component over its own primitive.
  'components/Badge/Badge.tsx': ['badge'],
  'components/Button/Button.tsx': ['button'],
  'components/Checkbox/Checkbox.tsx': ['checkbox'],
  'components/Command/Command.tsx': ['command'],
  'components/Dialog/Dialog.tsx': ['dialog'],
  'components/DropdownMenu/DropdownMenu.tsx': ['dropdown-menu'],
  'components/DropdownMenuItem/DropdownMenuItem.tsx': ['dropdown-menu'],
  'components/Field/Field.tsx': ['field'],
  'components/Input/Input.tsx': ['input'],
  'components/KeyboardShortcut/KeyboardShortcut.tsx': ['kbd'],
  // The divider between its regions: Separator has no design-system component.
  'components/Popover/Popover.tsx': ['popover', 'separator'],
  'components/Progress/Progress.tsx': ['progress'],
  'components/Select/Select.tsx': ['select'],
  'components/Skeleton/Skeleton.tsx': ['skeleton'],
  'components/Spinner/Spinner.tsx': ['spinner'],
  'components/Switch/Switch.tsx': ['switch'],
  'components/Textarea/Textarea.tsx': ['textarea'],
  'components/Tooltip/Tooltip.tsx': ['tooltip'],
  // The live overlay every dialog renders in. Dialog itself is the static shell, by design.
  'lib/dialog-shell.tsx': ['dialog', 'alert-dialog'],
  // The toast host, a provider the Toast component doesn't expose.
  'AppShell.tsx': ['sonner'],
  'screens/errors/CrashScreen.tsx': ['sonner'],
  // The dev catalog's scrolling lists: ScrollArea has no design-system component.
  'design-system/DesignSystemCatalog.tsx': ['scroll-area'],
  // Waiting on a Figma decision. Its suggestions are a menu-styled panel around a Command list
  // whose input is the tag chip; Figma's Popover and Command have neither form.
  'components/TagEditor/TagEditor.tsx': ['popover', 'command'],
  // Waiting on a Figma decision. Figma draws it as its own one-column panel, and its search field
  // has a clear button and no shortcut hint; Figma's Popover and Input have neither form.
  'components/TagFilterPopover/TagFilterPopover.tsx': ['popover', 'input']
}
const UI_GROUP = ['@renderer/ui/*', '**/ui/*']
const uiImportRule = (allowed = []) => [
  'error',
  {
    patterns: [
      {
        group: [
          ...UI_GROUP,
          ...allowed.flatMap((name) => [`!@renderer/ui/${name}`, `!**/ui/${name}`])
        ],
        message: 'Import the design-system component from components/* instead (H-13).'
      }
    ]
  }
]

export default tseslint.config(
  { ignores: ['dist', 'out', 'node_modules', 'tmp', '**/*.config.*', '.github'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules
    }
  },
  {
    // Node scripts (plain JS) — provide Node globals so no-undef passes.
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } }
  },
  {
    files: [`${RENDERER}/**/*.{ts,tsx}`],
    ignores: [`${RENDERER}/ui/**`],
    rules: { 'no-restricted-imports': uiImportRule() }
  },
  ...Object.entries(UI_IMPORTS).map(([file, allowed]) => ({
    files: [`${RENDERER}/${file}`],
    rules: { 'no-restricted-imports': uiImportRule(allowed) }
  })),
  prettier
)
