import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../supabase';

export default function DashboardScreen() {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ totalProj: 0, pendingTasks: 0, finishedProj: 0 }); 
  const [recentProjects, setRecentProjects] = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  async function fetchData() {
    if (recentProjects.length === 0) setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // 1. Profil
      const { data: userData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(userData);

      // 2. Ambil Project
      const { data: memberData } = await supabase.from('competition_members').select('competition_id').eq('user_id', user.id);
      const compIds = memberData ? memberData.map(m => m.competition_id) : [];

      let projectQuery = supabase.from('competitions').select('*').order('created_at', { ascending: false });
      if (compIds.length > 0) {
        projectQuery = projectQuery.or(`created_by.eq.${user.id},id.in.(${compIds.join(',')})`);
      } else {
        projectQuery = projectQuery.eq('created_by', user.id);
      }
      
      const { data: projectsData } = await projectQuery;

      // 3. Ambil Tugas Personal (Untuk Hitung yang Belum Kelar)
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*, competitions(title)')
        .eq('assigned_to', user.id)
        .order('created_at', { ascending: false });

      if (projectsData || tasksData) {
        setRecentProjects(projectsData?.slice(0, 3) || []);
        setRecentTasks(tasksData?.slice(0, 5) || []);
        
        // --- UPDATE LOGIKA STATISTIK ---
        setStats({
          totalProj: projectsData?.length || 0,
          pendingTasks: tasksData?.filter(t => t.status !== 'done').length || 0, // Tugas yang Belum Dikerjakan
          finishedProj: projectsData?.filter(p => p.status === 'finished').length || 0
        });
      }

    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  }

  const firstName = profile?.full_name ? profile.full_name.split(' ')[0] : 'Strategist';

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        
        {/* HEADER - Padding dirapatkan */}
        <View style={styles.header}>
          <View>
            <View style={styles.tagLine}>
              <Text style={styles.tagText}>AETHER COMMAND CENTER</Text>
            </View>
            <Text style={styles.welcomeText}>Halo, {firstName}!</Text>
            <Text style={styles.subText}>Ringkasan Project strategis hari ini.</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/profile')}>
            <Image source={{ uri: profile?.avatar_url || 'https://i.pravatar.cc/150' }} style={styles.headerAvatar} />
          </TouchableOpacity>
        </View>

        {/* STATS GRID - Tengah Menampilkan Tugas Belum Dikerjakan */}
        <View style={styles.statsGrid}>
          <View style={[styles.statBox, { borderBottomColor: '#6366F1' }]}>
            <Text style={styles.statVal}>{stats.totalProj}</Text>
            <Text style={styles.statTitle}>Project</Text>
          </View>
          <View style={[styles.statBox, { borderBottomColor: '#F59E0B' }]}>
            <Text style={styles.statVal}>{stats.pendingTasks}</Text>
            <Text style={styles.statTitle}>Tugas Pending</Text>
          </View>
          <View style={[styles.statBox, { borderBottomColor: '#10B981' }]}>
            <Text style={styles.statVal}>{stats.finishedProj}</Text>
            <Text style={styles.statTitle}>Project Sukses</Text>
          </View>
        </View>

        {/* PROJECTS SECTION */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Project Strategis</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/lomba')}><Text style={styles.linkText}>Eksplor</Text></TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
          {recentProjects.map((proj) => {
            const isFinished = proj.status === 'finished';
            return (
              <TouchableOpacity key={proj.id} style={styles.projectCard} onPress={() => router.push({ pathname: '/detail', params: { compId: proj.id, compTitle: proj.title } })}>
                <Image source={{ uri: proj.image_url || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500' }} style={styles.projectImg} />
                <View style={styles.projectInfo}>
                  <Text style={styles.projectTitle} numberOfLines={1}>{proj.title}</Text>
                  <View style={styles.statusRow}>
                    <View style={[styles.dot, { backgroundColor: isFinished ? '#10B981' : '#F59E0B' }]} />
                    <Text style={styles.statusText}>{isFinished ? 'Selesai' : 'Sedang Berjalan'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* TASKS SECTION */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Delegasi Pekerjaan</Text>
        </View>

        <View style={styles.taskContainer}>
          {loading && recentTasks.length === 0 ? <ActivityIndicator color="#6366F1" /> : recentTasks.map((task) => (
            <View key={task.id} style={styles.taskCard}>
              <View style={[styles.taskIndicator, { backgroundColor: task.status === 'done' ? '#10B981' : '#6366F1' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.taskName, task.status === 'done' && styles.strike]}>{task.title}</Text>
                <Text style={styles.taskProject}>{task.competitions?.title || 'General Task'}</Text>
              </View>
              <Ionicons name={task.status === 'done' ? "checkmark-circle" : "hourglass-outline"} size={20} color={task.status === 'done' ? "#10B981" : "#CBD5E1"} />
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollArea: { flex: 1 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 25, 
    paddingTop: 45, // Dirapatkan dari 60 ke 45
    marginBottom: 20 // Dirapatkan dari 30 ke 20
  },
  tagLine: { 
    backgroundColor: '#EEF2FF', 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 6, 
    alignSelf: 'flex-start', 
    marginBottom: 4 // Dirapatkan dari 8 ke 4
  },
  tagText: { fontSize: 10, fontWeight: '900', color: '#6366F1', letterSpacing: 1 },
  welcomeText: { fontSize: 26, fontWeight: '900', color: '#0F172A', lineHeight: 30 },
  subText: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  headerAvatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#E2E8F0' },
  statsGrid: { flexDirection: 'row', paddingHorizontal: 25, gap: 12, marginBottom: 30 },
  statBox: { flex: 1, backgroundColor: '#FFF', padding: 16, borderRadius: 20, elevation: 2, borderBottomWidth: 4 },
  statVal: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
  statTitle: { fontSize: 10, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginTop: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, marginBottom: 15 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  linkText: { fontSize: 13, fontWeight: '700', color: '#6366F1' },
  horizontalScroll: { paddingLeft: 25, paddingBottom: 10 },
  projectCard: { width: 220, backgroundColor: '#FFF', borderRadius: 24, marginRight: 15, elevation: 4, overflow: 'hidden' },
  projectImg: { width: '100%', height: 120 },
  projectInfo: { padding: 15 },
  projectTitle: { fontSize: 15, fontWeight: '900', color: '#0F172A', marginBottom: 5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  taskContainer: { paddingHorizontal: 25 },
  taskCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 20, marginBottom: 12, elevation: 1 },
  taskIndicator: { width: 4, height: 30, borderRadius: 2, marginRight: 15 },
  taskName: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  taskProject: { fontSize: 11, color: '#94A3B8', fontWeight: '700', marginTop: 2 },
  strike: { textDecorationLine: 'line-through', color: '#CBD5E1' }
});