interface AppHeaderProps {
  supported: boolean
}

export function AppHeader({ supported }: AppHeaderProps) {
  return (
    <header className="app-header">
      <h1 className="app-header__title">ReadAloud</h1>
      <p className="app-header__subtitle">Paste. Press Play. Listen.</p>
      <p className="app-header__privacy">
        {supported
          ? 'Text stays on your device and is never stored or sent anywhere.'
          : 'Text stays on your device.'}
      </p>
    </header>
  )
}
