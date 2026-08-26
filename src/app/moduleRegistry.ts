import type { RemixiconComponentType } from '@remixicon/react'
import type { ComponentType } from 'react'

export interface AppModule {
  id: string
  label: string
  icon: RemixiconComponentType
  route: string
  component: ComponentType
  // [hashId, label] pairs shown as sub-items in the sidebar on hover; the view reads the hash.
  tabs?: readonly (readonly [string, string])[]
  // Listed in Settings > Miscellaneous > Plugins, and off until enabled there.
  plugin?: boolean
  // Sections contributed to the chat sidebar. Order follows module registration order in main.tsx,
  // same as the sidebar. A panel that shouldn't show renders null — no visibility API.
  chatPanels?: readonly { label: string; component: ComponentType }[]
  // Text appended to the outgoing user message, before token substitution. '' contributes nothing.
  // ctx is exactly what the one current caller (body map) needs. Widen it when a second
  // contributor wants more — it's a compile error in one place, so guessing wider now buys nothing.
  decorateMessage?(ctx: MessageContext): string | Promise<string>
}

/** What a decorator gets told about the message being sent. */
export interface MessageContext {
  chatId: number
  user: string
  char: string
}

export const modules: AppModule[] = []

/** Whether a module is active. Non-plugin modules always are; plugins wait for their setting.
 *  Takes the record rather than reading the store so components can subscribe and re-render. */
export function isEnabled(mod: AppModule, enabledPlugins: Record<string, boolean>) {
  return !mod.plugin || enabledPlugins[mod.id] === true
}

export function registerModule(mod: AppModule) {
  modules.push(mod)
}

/** Every chat-sidebar section, in module registration order. */
export function chatPanels(enabledPlugins: Record<string, boolean>) {
  return modules.filter((mod) => isEnabled(mod, enabledPlugins)).flatMap((mod) => mod.chatPanels ?? [])
}
