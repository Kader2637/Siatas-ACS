import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Platform, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker'; 
import { supabase } from '../../supabase';

export default function LombaScreen() {
    const [competitions, setCompetitions] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    const [filterStatus, setFilterStatus] = useState('active');

    const [notif, setNotif] = useState({ show: false, message: '', type: 'success' });

    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    
    // --- STATE TARGET & PICKER ---
    const [newTargetDate, setNewTargetDate] = useState(''); 
    const [showPicker, setShowPicker] = useState(false); 
    const [dateValue, setDateValue] = useState(new Date()); 

    const [imageUri, setImageUri] = useState(null);
    const [imageBase64, setImageBase64] = useState(null);
    const [uploading, setUploading] = useState(false);

    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useFocusEffect(
        useCallback(() => {
            fetchCompetitions();
        }, [filterStatus])
    );

    async function fetchCompetitions() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setCurrentUser(user);

        const { data: memberData } = await supabase
            .from('competition_members')
            .select('competition_id')
            .eq('user_id', user.id);

        const compIds = memberData ? memberData.map(m => m.competition_id) : [];

        let query = supabase.from('competitions')
            .select('*')
            .eq('status', filterStatus)
            .order('created_at', { ascending: false });

        if (compIds.length > 0) {
            query = query.or(`created_by.eq.${user.id},id.in.(${compIds.join(',')})`);
        } else {
            query = query.eq('created_by', user.id);
        }

        const { data } = await query;
        if (data) setCompetitions(data);
    }

    const getDeadlineStatus = (targetDate) => {
        if (!targetDate) return { text: 'Tanpa Target', color: '#94A3B8' };

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(targetDate);
        target.setHours(0, 0, 0, 0);

        const diffTime = target.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { text: 'Telat', color: '#EF4444' };
        if (diffDays === 0) return { text: 'Hari Ini', color: '#F59E0B' };
        return { text: `${diffDays} hari lagi`, color: '#6366F1' };
    };

    const onDateChange = (event, selectedDate) => {
        setShowPicker(false);
        if (selectedDate) {
            setDateValue(selectedDate);
            const formatted = selectedDate.toISOString().split('T')[0];
            setNewTargetDate(formatted);
        }
    };

    const handleToggleFinish = async (item) => {
        if (item.created_by !== currentUser?.id) return;
        const nextStatus = item.status === 'active' ? 'finished' : 'active';
        const label = nextStatus === 'finished' ? 'Selesaikan' : 'Aktifkan Kembali';

        Alert.alert(label, `Yakin ingin menandai Project "${item.title}" sebagai ${nextStatus}?`, [
            { text: "Batal", style: "cancel" },
            {
                text: "Ya, Lakukan", onPress: async () => {
                    const { error } = await supabase.from('competitions').update({ status: nextStatus }).eq('id', item.id);
                    if (!error) {
                        showNotif(`Project berhasil di-${nextStatus === 'finished' ? 'selesaikan' : 'aktifkan kembali'}!`);
                        fetchCompetitions();
                    } else {
                        showNotif(error.message, 'error');
                    }
                }
            }
        ]);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchCompetitions();
        setRefreshing(false);
    }, [filterStatus]);

    const showNotif = (msg, type = 'success') => {
        setNotif({ show: true, message: msg, type });
        setTimeout(() => setNotif({ show: false, message: '', type: 'success' }), 3000);
    };

    const openAddModal = () => {
        setEditingId(null);
        setNewTitle('');
        setNewDesc('');
        setNewTargetDate(''); 
        setDateValue(new Date());
        setImageUri(null);
        setImageBase64(null);
        setModalVisible(true);
    };

    const openEditModal = (item) => {
        if (item.created_by !== currentUser?.id) {
            return Alert.alert("Akses Ditolak", "Hanya pembuat Project yang dapat mengubah data ini.");
        }
        setEditingId(item.id);
        setNewTitle(item.title);
        setNewDesc(item.description);
        setNewTargetDate(item.target_date || '');
        if(item.target_date) setDateValue(new Date(item.target_date));
        setImageUri(item.image_url);
        setImageBase64(null);
        setModalVisible(true);
    };

    async function handleSave() {
        if (!newTitle) return showNotif('Nama laga wajib diisi!', 'error');
        setUploading(true);
        let publicImageUrl = imageUri;

        if (imageBase64) {
            const fileName = `cover_${Date.now()}.jpg`;
            const { error: uploadError } = await supabase.storage.from('posters').upload(fileName, decode(imageBase64), { contentType: 'image/jpeg', upsert: true });
            if (!uploadError) {
                const { data: publicUrlData } = supabase.storage.from('posters').getPublicUrl(fileName);
                publicImageUrl = publicUrlData.publicUrl;
            }
        }

        let dbError;
        const payload = {
            title: newTitle,
            description: newDesc,
            image_url: publicImageUrl,
            target_date: newTargetDate 
        };

        if (editingId) {
            const { error } = await supabase.from('competitions').update(payload).eq('id', editingId);
            dbError = error;
        } else {
            const { error = null } = await supabase.from('competitions').insert([{ ...payload, created_by: currentUser.id, status: 'active' }]);
            dbError = error;
        }

        if (!dbError) {
            setModalVisible(false);
            fetchCompetitions();
            showNotif(editingId ? 'Perubahan berhasil disimpan!' : 'Project baru berhasil dibentuk!');
        } else {
            showNotif(dbError.message, 'error');
        }
        setUploading(false);
    }

    const triggerDelete = (item) => {
        if (item.created_by !== currentUser?.id) {
            return Alert.alert("Akses Ditolak", "Hanya pembuat Project yang memiliki otoritas menghapus.");
        }
        setItemToDelete(item);
        setDeleteModalVisible(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        setIsDeleting(true);
        const { error } = await supabase.from('competitions').delete().eq('id', itemToDelete.id);
        if (!error) {
            setDeleteModalVisible(false);
            setItemToDelete(null);
            fetchCompetitions();
            showNotif('Project berhasil dihapus secara permanen.');
        } else {
            showNotif(error.message, 'error');
        }
        setIsDeleting(false);
    };

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.5,
            base64: true,
        });
        if (!result.canceled) {
            setImageUri(result.assets[0].uri);
            setImageBase64(result.assets[0].base64);
        }
    };

    const renderItem = ({ item }) => {
        const isOwner = item.created_by === currentUser?.id;
        const isFinished = item.status === 'finished';
        const dlStatus = getDeadlineStatus(item.target_date);

        return (
            <TouchableOpacity
                style={[styles.compCard, isFinished && { opacity: 0.8 }]}
                activeOpacity={0.9}
                onPress={() => router.push({ pathname: '/detail', params: { compId: item.id, compTitle: item.title } })}
            >
                <Image source={{ uri: item.image_url || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80' }} style={styles.compImage} />
                <View style={styles.badgeAktif}>
                    <View style={[styles.dotIndicator, { backgroundColor: isFinished ? '#94A3B8' : '#10B981' }]} />
                    <Text style={styles.badgeText}>{isFinished ? 'SELESAI' : (isOwner ? 'Milik Anda' : 'Anggota Tim')}</Text>
                </View>

                {!isFinished && (
                    <View style={[styles.deadlineBadge, { backgroundColor: dlStatus.color }]}>
                        <Text style={styles.deadlineText}>{dlStatus.text}</Text>
                    </View>
                )}

                <View style={styles.compContent}>
                    <Text style={[styles.compTitle, isFinished && { textDecorationLine: 'line-through', color: '#94A3B8' }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.compDesc} numberOfLines={2}>{item.description || 'Tidak ada deskripsi detail.'}</Text>

                    <View style={styles.footerCard}>
                        {isOwner ? (
                            <View style={styles.actionRow}>
                                <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(item)}>
                                    <Ionicons name="pencil" size={14} color="#6366F1" />
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.finishBtn, { backgroundColor: isFinished ? '#F1F5F9' : '#ECFDF5' }]} onPress={() => handleToggleFinish(item)}>
                                    <Ionicons name={isFinished ? "refresh-outline" : "checkmark-done"} size={14} color={isFinished ? "#64748B" : "#10B981"} />
                                    <Text style={[styles.finishBtnText, { color: isFinished ? "#64748B" : "#10B981" }]}>{isFinished ? 'Buka' : 'Selesai'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.deleteBtn} onPress={() => triggerDelete(item)}>
                                    <Ionicons name="trash" size={14} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.actionRow}>
                                <View style={styles.memberBadge}>
                                    <Ionicons name="people" size={12} color="#64748B" />
                                    <Text style={styles.memberBadgeText}>Read Only</Text>
                                </View>
                            </View>
                        )}
                        <Text style={styles.dateText}>Detail ➔</Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.tabFilter}>
                <TouchableOpacity style={[styles.tabItem, filterStatus === 'active' && styles.tabActive]} onPress={() => setFilterStatus('active')}>
                    <Text style={[styles.tabLabel, filterStatus === 'active' && styles.tabLabelActive]}>Project Aktif</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabItem, filterStatus === 'finished' && styles.tabActive]} onPress={() => setFilterStatus('finished')}>
                    <Text style={[styles.tabLabel, filterStatus === 'finished' && styles.tabLabelActive]}>Selesai</Text>
                </TouchableOpacity>
            </View>

            {notif.show && (
                <View style={[styles.notifBanner, { backgroundColor: notif.type === 'error' ? '#FEF2F2' : '#ECFDF5', borderColor: notif.type === 'error' ? '#FECACA' : '#A7F3D0' }]}>
                    <Ionicons name={notif.type === 'error' ? 'alert-circle' : 'checkmark-circle'} size={20} color={notif.type === 'error' ? '#EF4444' : '#10B981'} style={{ marginRight: 8 }} />
                    <Text style={{ color: notif.type === 'error' ? '#B91C1C' : '#047857', fontWeight: '800', fontSize: 13, flex: 1 }}>{notif.message}</Text>
                </View>
            )}

            <View style={styles.header}>
                <View style={styles.headerIconBg}><Ionicons name="trophy" size={24} color="#6366F1" /></View>
                <View>
                    <Text style={styles.pageTitle}>Project Saya</Text>
                    <Text style={styles.pageSub}>Kelola project dan laga strategismu</Text>
                </View>
            </View>

            <FlatList
                data={competitions}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6366F1']} />}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIconWrapper}>
                            <Ionicons name={filterStatus === 'active' ? "rocket-outline" : "checkmark-done-circle-outline"} size={42} color="#94A3B8" />
                        </View>
                        <Text style={styles.emptyTitle}>Belum Ada Project</Text>
                        <Text style={styles.emptyDesc}>
                            {filterStatus === 'active' 
                                ? "Luncurkan project baru Anda sekarang dan mulai kolaborasi bersama tim." 
                                : "Belum ada project yang ditandai selesai."}
                        </Text>
                    </View>
                }
            />

            <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={openAddModal}>
                <Ionicons name="add" size={32} color="#FFFFFF" />
            </TouchableOpacity>

            <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{editingId ? 'Update Strategi' : 'Inisiasi Laga Baru'}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                                <Ionicons name="close" size={20} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={styles.imagePickerArea} onPress={pickImage} activeOpacity={0.8}>
                            {imageUri ? <Image source={{ uri: imageUri }} style={styles.previewImage} /> : (
                                <View style={styles.imagePlaceholder}>
                                    <View style={styles.iconCirclePlaceholder}><Ionicons name="image-outline" size={24} color="#6366F1" /></View>
                                    <Text style={styles.imagePlaceholderText}>Pilih Poster Project</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Nama Project / Laga</Text>
                            <TextInput style={styles.input} placeholder="Cth: Hackathon Nasional" placeholderTextColor="#94A3B8" value={newTitle} onChangeText={setNewTitle} />
                        </View>

                        {/* --- INPUT TANGGAL DENGAN KALENDER --- */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Target Selesai</Text>
                            <TouchableOpacity style={styles.dateSelector} onPress={() => setShowPicker(true)}>
                                <Ionicons name="calendar-outline" size={20} color="#6366F1" style={{marginRight: 10}} />
                                <Text style={styles.dateTextLabel}>
                                    {newTargetDate ? newTargetDate : "Pilih Tanggal Target"}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {showPicker && (
                            <DateTimePicker
                                value={dateValue}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={onDateChange}
                                minimumDate={new Date()} // Biar nggak bisa pilih masa lalu
                            />
                        )}

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Deskripsi Singkat</Text>
                            <TextInput style={[styles.input, styles.inputArea]} placeholder="Tuliskan misi utama..." placeholderTextColor="#94A3B8" multiline value={newDesc} onChangeText={setNewDesc} />
                        </View>
                        <TouchableOpacity style={styles.submitBtn} onPress={handleSave} disabled={uploading}>
                            {uploading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>{editingId ? 'Simpan Perubahan' : 'Luncurkan Project'}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal animationType="fade" transparent={true} visible={deleteModalVisible} onRequestClose={() => setDeleteModalVisible(false)}>
                <View style={styles.modalOverlayCenter}>
                    <View style={styles.deleteModalContent}>
                        <View style={styles.deleteIconBg}><Ionicons name="warning" size={32} color="#EF4444" /></View>
                        <Text style={styles.deleteModalTitle}>Hapus Permanen?</Text>
                        <Text style={styles.deleteModalDesc}>Tindakan ini akan menghapus <Text style={{ fontWeight: '900', color: '#0F172A' }}>{itemToDelete?.title}</Text> beserta seluruh tugas di dalamnya.</Text>
                        <View style={styles.deleteModalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteModalVisible(false)} disabled={isDeleting}><Text style={styles.cancelBtnText}>Batal</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.confirmDeleteBtn} onPress={confirmDelete} disabled={isDeleting}>
                                {isDeleting ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.confirmDeleteBtnText}>Ya, Hapus</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0F4F8' },
    tabFilter: { flexDirection: 'row', backgroundColor: '#FFF', padding: 5, marginHorizontal: 24, marginTop: 20, borderRadius: 18, elevation: 4 },
    tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 14 },
    tabActive: { backgroundColor: '#6366F1' },
    tabLabel: { fontSize: 13, fontWeight: '800', color: '#94A3B8' },
    tabLabelActive: { color: '#FFF' },
    notifBanner: { position: 'absolute', top: 50, left: 24, right: 24, padding: 16, borderRadius: 16, borderWidth: 1, zIndex: 100, flexDirection: 'row', alignItems: 'center', elevation: 10 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 15 },
    headerIconBg: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    pageTitle: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
    pageSub: { fontSize: 13, color: '#64748B', fontWeight: '500', marginTop: 2 },
    listContent: { paddingHorizontal: 24, paddingBottom: 140, paddingTop: 10 },
    compCard: { backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden', marginBottom: 20, elevation: 6 },
    compImage: { width: '100%', height: 180, backgroundColor: '#E2E8F0' },
    badgeAktif: { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.75)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    deadlineBadge: { position: 'absolute', top: 16, right: 16, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
    deadlineText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
    dotIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981', marginRight: 6 },
    badgeText: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    compContent: { padding: 20 },
    compTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 6 },
    compDesc: { fontSize: 13, color: '#64748B', lineHeight: 20, fontWeight: '500', marginBottom: 15 },
    footerCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: '#F1F5F9', paddingTop: 16 },
    actionRow: { flexDirection: 'row', gap: 8 },
    editBtn: { padding: 8, backgroundColor: '#E0E7FF', borderRadius: 10 },
    finishBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, gap: 5 },
    finishBtnText: { fontSize: 11, fontWeight: '900' },
    deleteBtn: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 10 },
    dateText: { fontSize: 13, fontWeight: '800', color: '#6366F1' },
    fab: { position: 'absolute', bottom: Platform.OS === 'ios' ? 110 : 90, right: 24, width: 64, height: 64, borderRadius: 32, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', elevation: 10 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
    closeBtn: { padding: 8, backgroundColor: '#F1F5F9', borderRadius: 20 },
    imagePickerArea: { width: '100%', height: 160, backgroundColor: '#F8FAFC', borderRadius: 20, borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed', overflow: 'hidden', marginBottom: 20, justifyContent: 'center', alignItems: 'center' },
    previewImage: { width: '100%', height: '100%' },
    imagePlaceholder: { alignItems: 'center' },
    iconCirclePlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    imagePlaceholderText: { color: '#0F172A', fontWeight: '800', fontSize: 14 },
    inputGroup: { marginBottom: 16 },
    inputLabel: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 8, textTransform: 'uppercase' },
    input: { backgroundColor: '#F8FAFC', color: '#0F172A', padding: 16, borderRadius: 16, fontSize: 15, borderWidth: 1, borderColor: '#E2E8F0' },
    inputArea: { height: 100, textAlignVertical: 'top' },
    dateSelector: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center' },
    dateTextLabel: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
    submitBtn: { backgroundColor: '#6366F1', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 10 },
    submitBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
    modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    deleteModalContent: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, alignItems: 'center', width: '100%' },
    deleteIconBg: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    deleteModalTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginBottom: 8 },
    deleteModalDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 24 },
    deleteModalActions: { flexDirection: 'row', gap: 12, width: '100%' },
    cancelBtn: { flex: 1, backgroundColor: '#F1F5F9', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
    cancelBtnText: { color: '#475569', fontWeight: '800', fontSize: 15 },
    confirmDeleteBtn: { flex: 1, backgroundColor: '#EF4444', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
    confirmDeleteBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },

    // --- STYLE BARU UNTUK EMPTY STATE ELEGANT ---
    emptyContainer: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 40, alignItems: 'center', marginTop: 20, borderStyle: 'dashed', borderWidth: 2, borderColor: '#E2E8F0' },
    emptyIconWrapper: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 8 },
    emptyDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 }
});