package expo.modules.reminderhealth

import android.app.AlarmManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Read-only checks of the Android settings that decide whether a reminder rings on time.
 */
class ReminderHealthModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ReminderHealth")

    // Android 12+: exact alarms need a permission the user can refuse (refused by default on
    // Android 14+). Without it, expo-notifications falls back to inexact alarms.
    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        true
      } else {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.canScheduleExactAlarms()
      }
    }

    // When true, battery optimisation cannot postpone or kill the app's alarms.
    Function("isIgnoringBatteryOptimizations") {
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("getPackageName") {
      context.packageName
    }
  }
}
