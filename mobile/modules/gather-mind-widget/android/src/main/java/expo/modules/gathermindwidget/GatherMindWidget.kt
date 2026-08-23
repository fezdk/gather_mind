package expo.modules.gathermindwidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.format.DateFormat
import android.text.format.DateUtils
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.AppWidgetId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.Text
import androidx.glance.text.FontWeight
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.glance.state.PreferencesGlanceStateDefinition
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

private data class WidgetGoal(val id: String, val title: String)
private data class WidgetAppointment(val id: String, val title: String, val startsAt: Long)
private val widgetSnapshotRevisionKey = intPreferencesKey("gather_mind_widget_snapshot_revision")
private data class WidgetViewData(
  val completed: Int,
  val total: Int,
  val goals: List<WidgetGoal>,
  val appointment: WidgetAppointment?,
  val showDetails: Boolean,
)

class GatherMindWidget : GlanceAppWidget() {
  override val stateDefinition = PreferencesGlanceStateDefinition

  override val sizeMode = SizeMode.Responsive(
    setOf(
      DpSize(57.dp, 57.dp),
      DpSize(180.dp, 57.dp),
      DpSize(180.dp, 96.dp),
      DpSize(180.dp, 180.dp),
    ),
  )

  override suspend fun provideGlance(context: Context, id: GlanceId) {
    provideContent {
      currentState(widgetSnapshotRevisionKey)
      GatherMindWidgetContent(context, loadWidgetData(context))
    }
  }
}

internal suspend fun refreshGatherMindWidgets(context: Context) {
  val applicationContext = context.applicationContext
  val appWidgetIds = AppWidgetManager.getInstance(applicationContext)
    .getAppWidgetIds(ComponentName(applicationContext, GatherMindWidgetReceiver::class.java))
  val widget = GatherMindWidget()
  appWidgetIds.forEach { appWidgetId ->
    val glanceId = AppWidgetId(appWidgetId)
    // This state contains only a revision number; private widget content remains in the encrypted snapshot.
    updateAppWidgetState(applicationContext, glanceId) { preferences ->
      preferences[widgetSnapshotRevisionKey] = (preferences[widgetSnapshotRevisionKey] ?: 0) + 1
    }
    widget.update(applicationContext, glanceId)
  }
}

@Composable
private fun GatherMindWidgetContent(context: Context, data: WidgetViewData?) {
  val size = LocalSize.current
  when {
    size.width < 180.dp -> CompactWidget(context, data)
    size.height < 150.dp -> WideWidget(context, data)
    else -> ExpandedWidget(context, data)
  }
}

@Composable
private fun CompactWidget(context: Context, data: WidgetViewData?) {
  Box(
    modifier = GlanceModifier.fillMaxSize()
      .clickable(actionStartActivity(deepLinkIntent(context, "gathermind://today"))),
    contentAlignment = Alignment.Center,
  ) {
    Column(
      modifier = GlanceModifier.size(57.dp)
        .background(ColorProvider(R.color.gather_mind_widget_surface))
        .cornerRadius(20.dp)
        .padding(horizontal = 7.dp, vertical = 4.dp),
      verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
      Text(
        text = data?.let { "${it.completed}/${it.total}" } ?: "–",
        style = TextStyle(
          color = ColorProvider(R.color.gather_mind_widget_text),
          fontSize = 22.sp,
          fontWeight = FontWeight.Bold,
        ),
        maxLines = 1,
      )
      Text(
        text = "Today",
        style = TextStyle(color = ColorProvider(R.color.gather_mind_widget_muted), fontSize = 10.sp),
        maxLines = 1,
      )
    }
  }
}

@Composable
private fun WideWidget(context: Context, data: WidgetViewData?) {
  Row(
    modifier = widgetSurface(context, "gathermind://today")
      .padding(horizontal = 12.dp, vertical = 4.dp),
    verticalAlignment = Alignment.Vertical.CenterVertically,
  ) {
    Column(
      modifier = GlanceModifier.width(64.dp),
      verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
      Text(
        text = data?.let { "${it.completed}/${it.total}" } ?: "–",
        style = TextStyle(
          color = ColorProvider(R.color.gather_mind_widget_text),
          fontSize = 20.sp,
          fontWeight = FontWeight.Bold,
        ),
        maxLines = 1,
      )
      Text(
        text = "Today",
        style = TextStyle(color = ColorProvider(R.color.gather_mind_widget_muted), fontSize = 10.sp),
        maxLines = 1,
      )
    }
    Spacer(GlanceModifier.width(8.dp))
    if (data == null) {
      Text(
        text = "Open Gather Mind to refresh",
        modifier = GlanceModifier.defaultWeight(),
        style = TextStyle(color = ColorProvider(R.color.gather_mind_widget_muted), fontSize = 12.sp),
        maxLines = 1,
      )
    } else {
      val remaining = (data.total - data.completed).coerceAtLeast(0)
      Column(
        modifier = GlanceModifier.defaultWeight(),
        verticalAlignment = Alignment.Vertical.CenterVertically,
      ) {
        Text(
          text = if (data.showDetails && data.goals.isNotEmpty()) "○  ${data.goals.first().title}"
          else if (remaining == 0) "All goals gathered"
          else "$remaining ${if (remaining == 1) "goal" else "goals"} still open",
          style = TextStyle(
            color = ColorProvider(if (data.showDetails && data.goals.isNotEmpty()) R.color.gather_mind_widget_text else R.color.gather_mind_widget_muted),
            fontSize = 12.sp,
          ),
          maxLines = 1,
        )
        data.appointment?.let { appointment ->
          Spacer(GlanceModifier.height(2.dp))
          Text(
            text = wideAppointmentLine(context, appointment, data.showDetails),
            style = TextStyle(color = ColorProvider(R.color.gather_mind_widget_accent), fontSize = 11.sp, fontWeight = FontWeight.Medium),
            maxLines = 1,
          )
        }
      }
    }
  }
}

@Composable
private fun ExpandedWidget(context: Context, data: WidgetViewData?) {
  Column(
    modifier = widgetSurface(context, "gathermind://today")
      .padding(horizontal = 16.dp, vertical = 12.dp),
    verticalAlignment = Alignment.Vertical.CenterVertically,
  ) {
    Text(
      text = data?.let { "Today  ·  ${it.completed}/${it.total}" } ?: "Today",
      style = TextStyle(
        color = ColorProvider(R.color.gather_mind_widget_text),
        fontSize = 17.sp,
        fontWeight = FontWeight.Bold,
      ),
      maxLines = 1,
    )
    Spacer(GlanceModifier.height(7.dp))
    if (data == null) {
      MutedLine("Open Gather Mind to refresh")
      return@Column
    }
    val remaining = (data.total - data.completed).coerceAtLeast(0)
    if (!data.showDetails) {
      MutedLine(if (remaining == 0) "Everything gathered for today" else "$remaining ${if (remaining == 1) "goal" else "goals"} still open")
    } else if (data.goals.isEmpty()) {
      MutedLine(if (remaining == 0) "Everything gathered for today" else "$remaining ${if (remaining == 1) "goal" else "goals"} still open")
    } else {
      data.goals.take(if (data.appointment == null) 2 else 1).forEach { goal ->
        GoalLine(context, goal, 48.dp, 14.dp)
      }
    }
    data.appointment?.let { appointment ->
      Spacer(GlanceModifier.height(6.dp))
      AppointmentLine(context, appointment, data.showDetails, 48.dp, 14.dp)
    }
  }
}

@Composable
private fun GoalLine(context: Context, goal: WidgetGoal, height: Dp, verticalPadding: Dp) {
  Text(
    text = "○  ${goal.title}",
    modifier = GlanceModifier.fillMaxWidth().height(height)
      .clickable(actionStartActivity(deepLinkIntent(context, "gathermind://goal/${Uri.encode(goal.id)}")))
      .padding(vertical = verticalPadding),
    style = TextStyle(color = ColorProvider(R.color.gather_mind_widget_text), fontSize = 13.sp),
    maxLines = 1,
  )
}

@Composable
private fun AppointmentLine(context: Context, appointment: WidgetAppointment, showDetails: Boolean, height: Dp, verticalPadding: Dp) {
  Text(
    text = appointmentLine(context, appointment, showDetails),
    modifier = GlanceModifier.fillMaxWidth().height(height)
      .clickable(actionStartActivity(deepLinkIntent(context, "gathermind://appointment/${Uri.encode(appointment.id)}")))
      .padding(vertical = verticalPadding),
    style = TextStyle(
      color = ColorProvider(R.color.gather_mind_widget_accent),
      fontSize = 12.sp,
      fontWeight = FontWeight.Medium,
    ),
    maxLines = 1,
  )
}

@Composable
private fun MutedLine(text: String) {
  Text(
    text = text,
    style = TextStyle(color = ColorProvider(R.color.gather_mind_widget_muted), fontSize = 13.sp),
    maxLines = 2,
  )
}

private fun widgetSurface(context: Context, uri: String): GlanceModifier = GlanceModifier
  .fillMaxSize()
  .background(ColorProvider(R.color.gather_mind_widget_surface))
  .cornerRadius(24.dp)
  .clickable(actionStartActivity(deepLinkIntent(context, uri)))

private fun deepLinkIntent(context: Context, uri: String): Intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
  setPackage(context.packageName)
  flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
}

private fun appointmentLine(context: Context, appointment: WidgetAppointment, showDetails: Boolean): String {
  val tomorrow = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, 1) }.timeInMillis
  val dateKey = SimpleDateFormat("yyyy-MM-dd", Locale.US)
  val appointmentDay = dateKey.format(Date(appointment.startsAt))
  val whenText = when {
    DateUtils.isToday(appointment.startsAt) -> DateFormat.getTimeFormat(context).format(Date(appointment.startsAt))
    appointmentDay == dateKey.format(Date(tomorrow)) ->
      "Tomorrow ${DateFormat.getTimeFormat(context).format(Date(appointment.startsAt))}"
    else -> "${DateFormat.getMediumDateFormat(context).format(Date(appointment.startsAt))} ${DateFormat.getTimeFormat(context).format(Date(appointment.startsAt))}"
  }
  return if (showDetails && appointment.title.isNotBlank()) "Next · $whenText · ${appointment.title}" else "Next appointment · $whenText"
}

private fun wideAppointmentLine(context: Context, appointment: WidgetAppointment, showDetails: Boolean): String {
  val date = Date(appointment.startsAt)
  val tomorrow = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, 1) }.timeInMillis
  val dateKey = SimpleDateFormat("yyyy-MM-dd", Locale.US)
  val time = DateFormat.getTimeFormat(context).format(date)
  val whenText = when {
    DateUtils.isToday(appointment.startsAt) -> time
    dateKey.format(date) == dateKey.format(Date(tomorrow)) -> "Tomorrow $time"
    else -> "${SimpleDateFormat("MMM d", Locale.getDefault()).format(date)} $time"
  }
  return if (showDetails && appointment.title.isNotBlank()) "Next · $whenText · ${appointment.title}" else "Next · $whenText"
}

private fun loadWidgetData(context: Context): WidgetViewData? {
  val raw = WidgetSnapshotStore.read(context) ?: return null
  return runCatching {
    val snapshot = JSONObject(raw)
    if (snapshot.optInt("version") != 1) return null
    val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    val days = snapshot.getJSONArray("days")
    var day: JSONObject? = null
    for (index in 0 until days.length()) {
      val candidate = days.getJSONObject(index)
      if (candidate.optString("date") == today) {
        day = candidate
        break
      }
    }
    val currentDay = day ?: return null
    val goalsJson = currentDay.optJSONArray("goals")
    val goals = buildList {
      if (goalsJson != null) for (index in 0 until goalsJson.length()) {
        val goal = goalsJson.getJSONObject(index)
        val id = goal.optString("id")
        val title = goal.optString("title")
        if (id.isNotBlank() && title.isNotBlank()) add(WidgetGoal(id, title))
      }
    }
    val now = System.currentTimeMillis()
    val appointmentsJson = snapshot.optJSONArray("appointments")
    var appointment: WidgetAppointment? = null
    if (appointmentsJson != null) for (index in 0 until appointmentsJson.length()) {
      val item = appointmentsJson.getJSONObject(index)
      val startsAt = item.optLong("startsAt")
      if (startsAt >= now) {
        appointment = WidgetAppointment(item.optString("id"), item.optString("title"), startsAt)
        break
      }
    }
    WidgetViewData(
      completed = currentDay.optInt("completed").coerceAtLeast(0),
      total = currentDay.optInt("total").coerceAtLeast(0),
      goals = goals,
      appointment = appointment?.takeIf { it.id.isNotBlank() },
      showDetails = snapshot.optBoolean("showDetails"),
    )
  }.getOrNull()
}
