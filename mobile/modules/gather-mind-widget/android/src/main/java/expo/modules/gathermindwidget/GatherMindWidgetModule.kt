package expo.modules.gathermindwidget

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class GatherMindWidgetModule : Module() {
  private val context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("GatherMindWidget")

    AsyncFunction("updateSnapshot") Coroutine { snapshot: String ->
      WidgetSnapshotStore.write(context, snapshot)
      refreshGatherMindWidgets(context)
    }

    AsyncFunction("clearSnapshot") Coroutine { ->
      WidgetSnapshotStore.clear(context)
      refreshGatherMindWidgets(context)
    }
  }
}
