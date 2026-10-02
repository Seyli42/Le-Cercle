// Custom entry point: monitoring must be running before any screen renders,
// so that crashes during startup are reported too.
import '@/lib/monitoring';
// Background tasks must be defined at startup: the OS may launch the app only for them.
import '@/features/reminders/background';
import 'expo-router/entry';
