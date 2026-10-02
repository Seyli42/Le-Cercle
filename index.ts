// Custom entry point: monitoring must be running before any screen renders,
// so that crashes during startup are reported too.
import '@/lib/monitoring';
import 'expo-router/entry';
