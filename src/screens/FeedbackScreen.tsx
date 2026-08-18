import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, SOFT_SHADOW } from '../constants/theme';
import {
  type FeedbackCategory,
  type FeedbackContext,
  type FeedbackMessage,
  type FeedbackReport,
  createFeedbackReport,
  feedbackCategoryLabel,
  getFeedbackMessages,
  getFeedbackScreenshotUrl,
  getMyFeedbackReports,
  pickFeedbackScreenshot,
} from '../services';

const CATEGORIES: Array<{ id: FeedbackCategory; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'bug', icon: 'bug-outline' }, { id: 'incorrect_word_info', icon: 'book-outline' },
  { id: 'feature_request', icon: 'sparkles-outline' }, { id: 'account_subscription', icon: 'card-outline' },
  { id: 'general_feedback', icon: 'chatbubble-ellipses-outline' }, { id: 'other', icon: 'ellipsis-horizontal-circle-outline' },
];

export function FeedbackScreen({ onClose, accessStatus, initialContext }: { onClose: () => void; accessStatus: string; initialContext?: FeedbackContext | null }) {
  const [mode, setMode] = useState<'compose' | 'reports'>('compose');
  const [category, setCategory] = useState<FeedbackCategory>(initialContext?.wordId ? 'incorrect_word_info' : 'general_feedback');
  const [subject, setSubject] = useState(initialContext?.word ? `Incorrect information for “${initialContext.word}”` : '');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<{ uri: string; mimeType?: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, FeedbackMessage[]>>({});

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    try { setReports(await getMyFeedbackReports()); }
    catch (error) { Alert.alert('Could not load reports', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setLoadingReports(false); }
  }, []);

  useEffect(() => { if (mode === 'reports') void loadReports(); }, [mode, loadReports]);

  async function attachScreenshot() {
    try {
      const asset = await pickFeedbackScreenshot();
      if (asset) setScreenshot({ uri: asset.uri, mimeType: asset.mimeType });
    } catch (error) { Alert.alert('Screenshot not attached', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function submit() {
    if (!subject.trim() || !description.trim()) {
      Alert.alert('Add a subject and description', 'A few details help us investigate and reply faster.');
      return;
    }
    setSubmitting(true);
    try {
      await createFeedbackReport({ category, subject, description, context: initialContext ?? { screen: 'Help & Feedback' }, accessStatus, screenshot });
      setSubject(''); setDescription(''); setScreenshot(null);
      Alert.alert('Thanks for the report', 'Your feedback is with the WordWiz team. You can follow replies in My Reports.', [
        { text: 'Done', onPress: onClose }, { text: 'My Reports', onPress: () => setMode('reports') },
      ]);
    } catch (error) { Alert.alert('Could not send feedback', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSubmitting(false); }
  }

  async function toggleReport(reportId: string) {
    if (expandedId === reportId) { setExpandedId(null); return; }
    setExpandedId(reportId);
    if (!messages[reportId]) {
      try {
        const reportMessages = await getFeedbackMessages(reportId);
        setMessages((current) => ({ ...current, [reportId]: reportMessages }));
      }
      catch (error) { Alert.alert('Could not load conversation', error instanceof Error ? error.message : 'Please try again.'); }
    }
  }

  return <View style={s.screen}>
    <ScrollView contentContainerStyle={s.content} refreshControl={mode === 'reports' ? <RefreshControl refreshing={loadingReports} onRefresh={() => { void loadReports(); }} tintColor={COLORS.purpleDark} /> : undefined}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to profile" onPress={onClose} style={s.back}><Ionicons name="arrow-back" size={21} color={COLORS.purpleDark} /></Pressable>
        <View style={s.headerIcon}><Ionicons name="help-buoy-outline" size={23} color={COLORS.white} /></View>
        <View style={{ flex: 1 }}><Text style={s.eyebrow}>WORDWIZ SUPPORT</Text><Text style={s.title}>Help & Feedback</Text></View>
      </View>
      <Text style={s.subtitle}>Tell us what would make WordWiz better. We’ll keep you posted here when the team responds.</Text>
      <View style={s.modeSwitch}>
        <Pressable onPress={() => setMode('compose')} style={[s.modeButton, mode === 'compose' && s.modeActive]}><Text style={[s.modeText, mode === 'compose' && s.modeTextActive]}>Send feedback</Text></Pressable>
        <Pressable onPress={() => setMode('reports')} style={[s.modeButton, mode === 'reports' && s.modeActive]}><Text style={[s.modeText, mode === 'reports' && s.modeTextActive]}>My Reports</Text>{reports.length ? <View style={s.reportCount}><Text style={s.reportCountText}>{reports.length}</Text></View> : null}</Pressable>
      </View>
      {mode === 'compose' ? <>
        {initialContext?.word ? <View style={s.contextCard}><Ionicons name="link-outline" size={18} color={COLORS.blue} /><View style={{ flex: 1 }}><Text style={s.contextTitle}>Word context attached</Text><Text style={s.contextText}>“{initialContext.word}”{initialContext.section ? ` · ${initialContext.section}` : ''}</Text></View></View> : null}
        <Text style={s.label}>WHAT CAN WE HELP WITH?</Text>
        <View style={s.categoryGrid}>{CATEGORIES.map((item) => <Pressable key={item.id} onPress={() => setCategory(item.id)} style={[s.category, category === item.id && s.categorySelected]}><Ionicons name={item.icon} size={18} color={category === item.id ? COLORS.purpleDark : COLORS.muted} /><Text style={[s.categoryText, category === item.id && s.categoryTextSelected]}>{feedbackCategoryLabel(item.id)}</Text><Ionicons name={category === item.id ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={category === item.id ? COLORS.purpleDark : COLORS.border} /></Pressable>)}</View>
        <Text style={s.label}>SUBJECT</Text><TextInput value={subject} onChangeText={setSubject} placeholder="A short summary" placeholderTextColor={COLORS.muted} style={s.input} maxLength={120} />
        <Text style={s.label}>DESCRIPTION</Text><TextInput value={description} onChangeText={setDescription} placeholder="What happened, what did you expect, and anything else that can help us…" placeholderTextColor={COLORS.muted} style={[s.input, s.description]} multiline textAlignVertical="top" maxLength={3000} />
        <Pressable onPress={() => { void attachScreenshot(); }} style={s.attachment}>{screenshot ? <Image source={{ uri: screenshot.uri }} style={s.thumbnail} /> : <View style={s.attachmentIcon}><Ionicons name="image-outline" size={20} color={COLORS.purpleDark} /></View>}<View style={{ flex: 1 }}><Text style={s.attachmentTitle}>{screenshot ? 'Screenshot attached' : 'Attach a screenshot'}</Text><Text style={s.attachmentText}>{screenshot ? 'Tap to replace it' : 'Optional · helps us see the issue'}</Text></View>{screenshot ? <Pressable onPress={() => setScreenshot(null)} hitSlop={10}><Ionicons name="close-circle" size={22} color={COLORS.muted} /></Pressable> : <Ionicons name="add" size={22} color={COLORS.purpleDark} />}</Pressable>
        <Text style={s.privacy}>We automatically attach your app/build, device, OS, current screen, access status, and timestamp so we can investigate. We never attach private word content unless you report it.</Text>
        <Pressable disabled={submitting} onPress={() => { void submit(); }} style={[s.submit, submitting && s.disabled]}>{submitting ? <ActivityIndicator color={COLORS.white} /> : <><Ionicons name="send-outline" size={18} color={COLORS.white} /><Text style={s.submitText}>SEND FEEDBACK</Text></>}</Pressable>
      </> : <>{loadingReports && !reports.length ? <View style={s.loading}><ActivityIndicator color={COLORS.purpleDark} /></View> : reports.length ? reports.map((report) => <ReportCard key={report.id} report={report} expanded={expandedId === report.id} messages={messages[report.id]} onPress={() => { void toggleReport(report.id); }} />) : <View style={s.empty}><Ionicons name="chatbubble-outline" size={27} color={COLORS.purpleDark} /><Text style={s.emptyTitle}>No reports yet</Text><Text style={s.emptyText}>When you send feedback, its status and team replies will show up here.</Text></View>}</>}
    </ScrollView>
  </View>;
}

function ReportCard({ report, expanded, messages, onPress }: { report: FeedbackReport; expanded: boolean; messages?: FeedbackMessage[]; onPress: () => void }) {
  const color = report.status === 'resolved' ? COLORS.greenDark : report.status === 'closed' ? COLORS.muted : COLORS.purpleDark;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => { if (expanded && report.screenshotPath) void getFeedbackScreenshotUrl(report.screenshotPath).then(setImageUrl); }, [expanded, report.screenshotPath]);
  return <Pressable onPress={onPress} style={s.report}><View style={s.reportTop}><View style={{ flex: 1 }}><Text style={s.reportCategory}>{feedbackCategoryLabel(report.category).toUpperCase()}</Text><Text style={s.reportSubject}>{report.subject}</Text></View><View style={[s.status, { backgroundColor: `${color}18` }]}><Text style={[s.statusText, { color }]}>{report.status.replace('_', ' ')}</Text></View></View><Text style={s.reportDate}>{new Date(report.createdAt).toLocaleDateString()}</Text>{expanded ? <View style={s.conversation}><Text style={s.reportDescription}>{report.description}</Text>{imageUrl ? <Image source={{ uri: imageUrl }} style={s.reportImage} /> : null}<Text style={s.conversationLabel}>CONVERSATION</Text>{messages?.length ? messages.map((message) => <View key={message.id} style={[s.message, message.senderRole === 'admin' && s.adminMessage]}><Text style={s.messageBy}>{message.senderRole === 'admin' ? 'WORDWIZ TEAM' : 'YOU'}</Text><Text style={s.messageText}>{message.message}</Text></View>) : <Text style={s.noReply}>No replies yet. We’ll post an update here.</Text>}</View> : null}<Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.purpleDark} style={s.chevron} /></Pressable>;
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:COLORS.background},content:{padding:20,paddingBottom:48},header:{flexDirection:'row',alignItems:'center',gap:10,marginTop:8},back:{width:40,height:40,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.white,borderWidth:1,borderColor:COLORS.border},headerIcon:{width:43,height:43,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.purpleDark},eyebrow:{color:COLORS.purpleDark,fontSize:10,fontWeight:'900',letterSpacing:1},title:{color:COLORS.ink,fontSize:25,fontWeight:'900',letterSpacing:-.6},subtitle:{color:COLORS.muted,fontSize:14,fontWeight:'600',lineHeight:20,marginTop:16},modeSwitch:{flexDirection:'row',marginTop:22,padding:4,borderRadius:15,backgroundColor:COLORS.lavender},modeButton:{flex:1,minHeight:40,borderRadius:11,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6},modeActive:{backgroundColor:COLORS.white,...SOFT_SHADOW},modeText:{fontSize:13,fontWeight:'800',color:COLORS.muted},modeTextActive:{color:COLORS.purpleDark},reportCount:{borderRadius:9,minWidth:18,height:18,paddingHorizontal:5,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.purpleDark},reportCountText:{fontSize:10,fontWeight:'900',color:COLORS.white},contextCard:{marginTop:22,padding:14,gap:10,flexDirection:'row',borderRadius:16,backgroundColor:COLORS.bluePale,borderWidth:1,borderColor:'#D7E5FF'},contextTitle:{color:COLORS.ink,fontSize:13,fontWeight:'900'},contextText:{color:COLORS.muted,fontSize:12,fontWeight:'700',marginTop:2},label:{color:COLORS.muted,fontSize:10,fontWeight:'900',letterSpacing:.9,marginTop:24,marginBottom:8},categoryGrid:{gap:8},category:{minHeight:48,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,borderRadius:14,backgroundColor:COLORS.white,borderWidth:1,borderColor:COLORS.border},categorySelected:{borderColor:COLORS.purple,backgroundColor:COLORS.purplePale},categoryText:{flex:1,color:COLORS.ink,fontSize:13,fontWeight:'800'},categoryTextSelected:{color:COLORS.purpleDark},input:{minHeight:48,paddingHorizontal:14,borderRadius:14,color:COLORS.ink,fontSize:14,fontWeight:'600',backgroundColor:COLORS.white,borderWidth:1,borderColor:COLORS.border},description:{height:134,paddingTop:13},attachment:{marginTop:16,minHeight:66,padding:10,borderRadius:16,backgroundColor:COLORS.white,borderWidth:1,borderStyle:'dashed',borderColor:COLORS.purple,flexDirection:'row',alignItems:'center',gap:11},attachmentIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.purplePale},thumbnail:{width:48,height:48,borderRadius:11},attachmentTitle:{color:COLORS.ink,fontSize:13,fontWeight:'900'},attachmentText:{color:COLORS.muted,fontSize:12,fontWeight:'600',marginTop:2},privacy:{color:COLORS.muted,fontSize:11,lineHeight:16,fontWeight:'600',marginTop:13},submit:{marginTop:20,minHeight:52,borderRadius:16,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8,backgroundColor:COLORS.purpleDark},disabled:{opacity:.55},submitText:{color:COLORS.white,fontSize:13,fontWeight:'900',letterSpacing:.8},loading:{padding:40,alignItems:'center'},empty:{alignItems:'center',padding:34,marginTop:28,borderRadius:20,backgroundColor:COLORS.white,borderWidth:1,borderColor:COLORS.border},emptyTitle:{marginTop:12,color:COLORS.ink,fontSize:16,fontWeight:'900'},emptyText:{marginTop:5,color:COLORS.muted,fontSize:13,lineHeight:19,fontWeight:'600',textAlign:'center'},report:{position:'relative',marginTop:13,padding:15,paddingBottom:16,borderRadius:18,backgroundColor:COLORS.white,borderWidth:1,borderColor:COLORS.border,...SOFT_SHADOW},reportTop:{flexDirection:'row',gap:10},reportCategory:{color:COLORS.purpleDark,fontSize:10,fontWeight:'900',letterSpacing:.8},reportSubject:{color:COLORS.ink,fontSize:15,fontWeight:'900',marginTop:4,paddingRight:10},status:{alignSelf:'flex-start',paddingHorizontal:8,paddingVertical:5,borderRadius:9},statusText:{fontSize:10,fontWeight:'900',textTransform:'uppercase'},reportDate:{color:COLORS.muted,fontSize:11,fontWeight:'700',marginTop:6},chevron:{position:'absolute',right:14,bottom:14},conversation:{borderTopWidth:1,borderTopColor:COLORS.border,marginTop:13,paddingTop:13},reportDescription:{color:COLORS.ink,fontSize:13,lineHeight:19,fontWeight:'600'},conversationLabel:{marginTop:14,color:COLORS.muted,fontSize:10,fontWeight:'900',letterSpacing:.8},message:{marginTop:8,padding:11,borderRadius:12,backgroundColor:COLORS.purplePale},adminMessage:{backgroundColor:COLORS.greenPale},messageBy:{fontSize:9,fontWeight:'900',color:COLORS.purpleDark,letterSpacing:.8},messageText:{marginTop:3,color:COLORS.ink,fontSize:13,lineHeight:18,fontWeight:'600'},noReply:{marginTop:7,color:COLORS.muted,fontSize:12,fontWeight:'600'},reportImage:{marginTop:12,width:'100%',height:160,borderRadius:12,backgroundColor:COLORS.border},
});
