import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, ImageBackground, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function DetailScreen() {
  const { compId, compTitle } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState('tugas');

  // --- DATA STATE ---
  const [currentUser, setCurrentUser] = useState(null);
  const [competition, setCompetition] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);

  // --- AKSES ---
  const [isMember, setIsMember] = useState(false);
  const [isCreator, setIsCreator] = useState(false);

  // --- MODAL TUGAS STATE ---
  const [taskModal, setTaskModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState(null);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);

  // --- MODAL TIM STATE ---
  const [teamModal, setTeamModal] = useState(false);
  const [teamModalMode, setTeamModalMode] = useState('complete');
  const [roleInput, setRoleInput] = useState('');
  const [selectedNewMember, setSelectedNewMember] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUser(user);

    const { data: compData } = await supabase.from('competitions').select('*').eq('id', compId).single();
    if (compData) {
      setCompetition(compData);
      if (user && compData.created_by === user.id) setIsCreator(true);
    }

    const { data: memberData } = await supabase
      .from('competition_members')
      .select('id, role, user_id, profiles(full_name, avatar_url)')
      .eq('competition_id', compId);

    let existingIds = [];
    if (memberData) {
      const formatted = memberData.map(m => ({
        id: m.user_id,
        name: m.profiles?.full_name || 'Strategist',
        role: m.role,
        avatar: m.profiles?.avatar_url || 'https://i.pravatar.cc/150'
      }));
      setMembers(formatted);
      existingIds = formatted.map(m => m.id);
      if (user && existingIds.includes(user.id)) setIsMember(true);
    }

    const { data: allUsers } = await supabase.from('profiles').select('id, full_name, avatar_url');
    if (allUsers) {
      setAvailableUsers(allUsers.filter(u => !existingIds.includes(u.id)));
    }

    const { data: taskData } = await supabase.from('tasks').select('*').eq('competition_id', compId).order('created_at', { ascending: false });
    if (taskData) setTasks(taskData);
    setLoading(false);
  }

  // --- HANDLER TUGAS ---
  const openAddTask = () => {
    setEditingTaskId(null);
    setNewTaskTitle('');
    setNewTaskAssignee(null);
    setStartDate(new Date());
    setEndDate(new Date());
    setTaskModal(true);
  };

  const handleSaveTask = async () => {
    if (!newTaskTitle || !newTaskAssignee) return Alert.alert("Eits", "Judul & Pelaksana harus diisi!");
    const payload = {
      competition_id: compId,
      title: newTaskTitle,
      assigned_to: newTaskAssignee,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      status: 'todo'
    };

    let error;
    if (editingTaskId) {
      const { error: err } = await supabase.from('tasks').update(payload).eq('id', editingTaskId);
      error = err;
    } else {
      const { error: err } = await supabase.from('tasks').insert([payload]);
      error = err;
    }

    if (!error) { setTaskModal(false); fetchData(); }
    else Alert.alert("Error", error.message);
  };

  const confirmDeleteTask = (id) => {
    Alert.alert("Hapus Tugas", "Yakin ingin menghapus delegasi ini?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus", style: "destructive", onPress: async () => {
          const { error } = await supabase.from('tasks').delete().eq('id', id);
          if (!error) fetchData();
        }
      }
    ]);
  };

  // --- HANDLER TIM ---
  const openAddMember = () => { setTeamModalMode('add_other'); setSelectedNewMember(null); setRoleInput(''); setTeamModal(true); };
  const openCompleteData = () => { setTeamModalMode('complete'); setRoleInput(''); setTeamModal(true); };

  async function handleTeamSubmit() {
    if (!roleInput) return Alert.alert("Error", "Role wajib diisi!");
    const targetId = teamModalMode === 'complete' ? currentUser?.id : selectedNewMember;
    if (!targetId) return Alert.alert("Info", "Pilih akun terlebih dahulu!");

    // Perbaikan: Pastikan data dikirim dengan benar sesuai skema
    const { error } = await supabase.from('competition_members').insert([
        { competition_id: compId, user_id: targetId, role: roleInput }
    ]);
    
    if (!error) { 
        setTeamModal(false); 
        fetchData(); 
    } else {
        Alert.alert("Gagal", "User mungkin sudah terdaftar di tim ini.");
    }
  }

  // --- FEATURE KICK MEMBER ---
  const confirmKickMember = (memberId, memberName) => {
    if (memberId === currentUser?.id) return Alert.alert("Info", "Anda tidak bisa mengeluarkan diri sendiri.");
    
    Alert.alert("Keluarkan Anggota", `Yakin ingin mengeluarkan ${memberName} dari Project ini?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Keluarkan", style: "destructive", onPress: async () => {
          const { error } = await supabase.from('competition_members')
            .delete()
            .eq('competition_id', compId)
            .eq('user_id', memberId);
          if (!error) fetchData();
        }
      }
    ]);
  };

  // --- LOGIKA DEADLINE WARNA ---
  const getDeadlineStyle = (target) => {
    if (!target) return { label: 'TBA', bg: '#F1F5F9', text: '#94A3B8' };
    const diff = new Date(target).getTime() - new Date().setHours(0,0,0,0);
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return { label: 'Terlewati', bg: '#E2E8F0', text: '#64748B' };
    if (days === 0) return { label: 'HARI INI', bg: '#FEE2E2', text: '#EF4444' }; // Danger
    if (days <= 2) return { label: `${days} hari lagi`, bg: '#FEE2E2', text: '#EF4444' }; // Danger
    if (days <= 5) return { label: `${days} hari lagi`, bg: '#FEF3C7', text: '#D97706' }; // Warning
    return { label: `${days} hari lagi`, bg: '#DCFCE7', text: '#15803D' }; // Success
  };

  return (
    <View style={styles.container}>
      <ImageBackground source={{ uri: competition?.image_url || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80' }} style={styles.header}>
        <View style={styles.headerOverlay}>
          {isCreator && <View style={styles.badge}><Text style={styles.badgeText}>MANAGER LAGA</Text></View>}
          <Text style={styles.title}>{compTitle}</Text>
          <Text style={styles.desc} numberOfLines={1}>{competition?.description || 'Strategi ACS'}</Text>
        </View>
      </ImageBackground>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'tugas' && styles.tabActive]} onPress={() => setActiveTab('tugas')}>
          <Ionicons name="flash" size={18} color={activeTab === 'tugas' ? '#FFF' : '#94A3B8'} />
          <Text style={[styles.tabLabel, activeTab === 'tugas' && styles.tabLabelActive]}>Tugas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'tim' && styles.tabActive]} onPress={() => setActiveTab('tim')}>
          <Ionicons name="people" size={18} color={activeTab === 'tim' ? '#FFF' : '#94A3B8'} />
          <Text style={[styles.tabLabel, activeTab === 'tim' && styles.tabLabelActive]}>Tim</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 50 }} /> : (
        <FlatList
          data={activeTab === 'tugas' ? tasks : members}
          keyExtractor={item => (activeTab === 'tugas' ? `task-${item.id}` : `member-${item.id}`)}
          contentContainerStyle={styles.listArea}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
                <Ionicons name="alert-circle-outline" size={50} color="#CBD5E1" />
                <Text style={styles.emptyText}>Data belum tersedia.</Text>
            </View>
          )}
          renderItem={({ item }) => {
            if (activeTab === 'tugas') {
              const assignee = members.find(m => m.id === item.assigned_to) || { name: 'Menunggu', avatar: 'https://i.pravatar.cc/150' };
              const dlInfo = getDeadlineStyle(item.end_date);
              return (
                <View style={styles.taskCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskName}>{item.title}</Text>
                    <View style={styles.meta}><Image source={{ uri: assignee.avatar }} style={styles.metaImg} /><Text style={styles.metaTxt}>{assignee.name}</Text></View>
                    <View style={styles.deadline}>
                      <Ionicons name="time-outline" size={12} color={dlInfo.text} />
                      <Text style={[styles.dateTxt, { color: dlInfo.text }]}>{item.end_date || 'TBA'}</Text>
                      <View style={[styles.daysBox, { backgroundColor: dlInfo.bg }]}><Text style={[styles.daysTxt, { color: dlInfo.text }]}>{dlInfo.label}</Text></View>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    {isCreator && (
                        <>
                            <TouchableOpacity onPress={() => { setEditingTaskId(item.id); setNewTaskTitle(item.title); setNewTaskAssignee(item.assigned_to); setTaskModal(true); }} style={styles.iconBtn}><Ionicons name="pencil" size={16} color="#6366F1" /></TouchableOpacity>
                            <TouchableOpacity onPress={() => confirmDeleteTask(item.id)} style={[styles.iconBtn, { backgroundColor: '#FEE2E2' }]}><Ionicons name="trash" size={16} color="#EF4444" /></TouchableOpacity>
                        </>
                    )}
                  </View>
                </View>
              )
            } else {
              return (
                <View style={styles.memberCard}>
                  <Image source={{ uri: item.avatar }} style={styles.memberImg} />
                  <View style={{ flex: 1, marginLeft: 15 }}><Text style={styles.memberName}>{item.name}</Text><Text style={styles.memberRole}>{item.role}</Text></View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {isCreator && item.id !== currentUser?.id && (
                        <TouchableOpacity style={[styles.chatBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => confirmKickMember(item.id, item.name)}><Ionicons name="trash" size={20} color="#EF4444" /></TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.chatBtn} onPress={() => router.push({ pathname: '/chat_room', params: { targetId: item.id, targetName: item.name, type: 'private' } })}><Ionicons name="chatbubbles" size={20} color="#FFF" /></TouchableOpacity>
                  </View>
                </View>
              )
            }
          }}
        />
      )}

      {/* FAB LOGIC */}
      {!isMember ? (
          <TouchableOpacity style={styles.fabCenter} onPress={openCompleteData}>
            <Ionicons name="person-circle" size={22} color="#FFF" />
            <Text style={styles.fabTxt}>Join Laga</Text>
          </TouchableOpacity>
      ) : (
          activeTab === 'tugas' ? (
              isMember && <TouchableOpacity style={styles.fabRight} onPress={openAddTask}><Ionicons name="add" size={35} color="#FFF" /></TouchableOpacity>
          ) : (
              isCreator && (
                <TouchableOpacity style={styles.fabCenter} onPress={openAddMember}>
                  <Ionicons name="person-add" size={22} color="#FFF" />
                  <Text style={styles.fabTxt}>Rekrut</Text>
                </TouchableOpacity>
              )
          )
      )}

      {/* MODAL TUGAS */}
      <Modal visible={taskModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>{editingTaskId ? 'Edit Delegasi' : 'Tugas Baru'}</Text>
            <TextInput style={styles.input} value={newTaskTitle} onChangeText={setNewTaskTitle} placeholder="Apa rencananya?" placeholderTextColor="#94A3B8" />

            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStart(true)}><Text style={styles.label}>START</Text><Text style={styles.dateVal}>{startDate.toLocaleDateString()}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEnd(true)}><Text style={styles.label}>END</Text><Text style={styles.dateVal}>{endDate.toLocaleDateString()}</Text></TouchableOpacity>
            </View>

            {showStart && <DateTimePicker value={startDate} mode="date" display="default" onChange={(e, d) => { setShowStart(false); if (d) setStartDate(d); }} />}
            {showEnd && <DateTimePicker value={endDate} mode="date" display="default" onChange={(e, d) => { setShowEnd(false); if (d) setEndDate(d); }} />}

            <Text style={styles.label}>PILIH PELAKSANA:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              {members.map(m => (
                <TouchableOpacity key={m.id} style={[styles.uCard, newTaskAssignee === m.id && styles.uActive]} onPress={() => setNewTaskAssignee(m.id)}>
                  <Image source={{ uri: m.avatar }} style={styles.uImg} />
                  <Text style={[styles.uName, newTaskAssignee === m.id && { color: '#6366F1' }]}>{m.name.split(' ')[0]}</Text>
                  {newTaskAssignee === m.id && <View style={styles.uCheck}><Ionicons name="checkmark" size={10} color="#FFF" /></View>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.btnSave} onPress={handleSaveTask}><Text style={styles.btnSaveTxt}>Konfirmasi</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setTaskModal(false)} style={styles.btnBack}><Text style={styles.btnBackTxt}>Batal</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL TIM */}
      <Modal visible={teamModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>{teamModalMode === 'complete' ? 'Data Diri' : 'Rekrut Akun'}</Text>
            {teamModalMode === 'add_other' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
                {availableUsers.length > 0 ? availableUsers.map(u => (
                  <TouchableOpacity key={u.id} style={[styles.uCard, selectedNewMember === u.id && styles.uActive]} onPress={() => setSelectedNewMember(u.id)}>
                    <Image source={{ uri: u.avatar_url || 'https://i.pravatar.cc/150' }} style={styles.uImg} />
                    <Text style={[styles.uName, selectedNewMember === u.id && { color: '#6366F1' }]}>{u.full_name.split(' ')[0]}</Text>
                    {selectedNewMember === u.id && <View style={styles.uCheck}><Ionicons name="checkmark" size={10} color="#FFF" /></View>}
                  </TouchableOpacity>
                )) : <Text style={styles.label}>User sudah join semua.</Text>}
              </ScrollView>
            )}
            <TextInput style={styles.input} placeholder="Role (Hacker/Hustler)" value={roleInput} onChangeText={setRoleInput} placeholderTextColor="#94A3B8" />
            <TouchableOpacity style={styles.btnSave} onPress={handleTeamSubmit}><Text style={styles.btnSaveTxt}>Selesai</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setTeamModal(false)} style={styles.btnBack}><Text style={styles.btnBackTxt}>Batal</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { width: '100%', height: 160 },
  headerOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: 25, justifyContent: 'flex-end', paddingBottom: 35 },
  badge: { backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 10 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  title: { color: '#FFF', fontSize: 24, fontWeight: '900' },
  desc: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },

  tabContainer: { flexDirection: 'row', backgroundColor: '#FFF', marginHorizontal: 25, marginTop: -25, borderRadius: 18, padding: 5, elevation: 8 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 15, gap: 8 },
  tabActive: { backgroundColor: '#6366F1' },
  tabLabel: { fontSize: 14, fontWeight: '800', color: '#94A3B8' },
  tabLabelActive: { color: '#FFF' },

  listArea: { padding: 25, paddingBottom: 150 },
  taskCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 18, marginBottom: 15, flexDirection: 'row', alignItems: 'center', elevation: 3, borderLeftWidth: 6, borderLeftColor: '#6366F1' },
  taskName: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaImg: { width: 22, height: 22, borderRadius: 11 },
  metaTxt: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  deadline: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  dateTxt: { fontSize: 11, fontWeight: '700' },
  daysBox: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  daysTxt: { fontSize: 10, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 10, backgroundColor: '#F1F5F9', borderRadius: 12 },

  memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 18, borderRadius: 20, marginBottom: 12, elevation: 2 },
  memberImg: { width: 55, height: 55, borderRadius: 18 },
  memberName: { fontSize: 17, fontWeight: '800', color: '#1E293B' },
  memberRole: { fontSize: 13, fontWeight: '700', color: '#6366F1' },
  chatBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },

  fabRight: { position: 'absolute', bottom: 15, right: 15, width: 66, height: 66, borderRadius: 33, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', elevation: 12 },
  fabCenter: { position: 'absolute', bottom: 15, alignSelf: 'center', flexDirection: 'row', backgroundColor: '#0F172A', paddingHorizontal: 25, paddingVertical: 16, borderRadius: 35, alignItems: 'center', gap: 8, elevation: 12 },
  fabTxt: { color: '#FFF', fontSize: 14, fontWeight: '900' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 35, borderTopRightRadius: 35, padding: 25, paddingBottom: 40 },
  handle: { width: 40, height: 5, backgroundColor: '#E2E8F0', borderRadius: 10, alignSelf: 'center', marginBottom: 25 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B', marginBottom: 20 },
  label: { fontSize: 11, fontWeight: '900', color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#F1F5F9', padding: 18, borderRadius: 18, fontSize: 16, color: '#1E293B', marginBottom: 15 },
  dateRow: { flexDirection: 'row', marginBottom: 20, gap: 10 },
  dateBtn: { flex: 1, backgroundColor: '#F1F5F9', padding: 15, borderRadius: 15 },
  dateVal: { fontSize: 14, fontWeight: '800', color: '#1E293B', marginTop: 5 },
  hScroll: { marginBottom: 25 },
  uCard: { alignItems: 'center', marginRight: 15, width: 85, padding: 10, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  uActive: { borderColor: '#6366F1', backgroundColor: '#EFF6FF' },
  uImg: { width: 50, height: 50, borderRadius: 16, marginBottom: 8 },
  uName: { fontSize: 12, fontWeight: '800', color: '#1E293B' },
  uCheck: { position: 'absolute', top: 5, right: 5, backgroundColor: '#6366F1', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  btnSave: { backgroundColor: '#6366F1', padding: 18, borderRadius: 18, alignItems: 'center', elevation: 4 },
  btnSaveTxt: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  btnBack: { marginTop: 15, alignItems: 'center' },
  btnBackTxt: { color: '#94A3B8', fontWeight: '800' },

  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#CBD5E1', marginTop: 10, fontWeight: '700' }
});