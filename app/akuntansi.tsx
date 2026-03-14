import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

const formatInput = (numStr) => {
  if (!numStr) return '';
  const clean = numStr.toString().replace(/\D/g, ''); 
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, "."); 
};

const parseInput = (numStr) => {
  if (!numStr) return 0;
  return parseInt(numStr.toString().replace(/\D/g, ''), 10) || 0;
};

export default function AkuntansiScreen() {
  const insets = useSafeAreaInsets();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [totalIncome, setTotalIncome] = useState(0);
  const [projects, setProjects] = useState([]);
  const [allUsers, setAllUsers] = useState([]); 

  // --- STATE SEARCH & FILTER ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all'); // Pilihan: 'all', 'owner', 'member'

  const [createModal, setCreateModal] = useState(false);
  const [manageModal, setManageModal] = useState(false);
  
  // State Termin
  const [terminModal, setTerminModal] = useState(false);
  const [selectedSplitToPay, setSelectedSplitToPay] = useState(null);
  const [selectedProjTermin, setSelectedProjTermin] = useState('1x'); 
  const [payAmount, setPayAmount] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [newBudget, setNewBudget] = useState(''); 
  const [newTerms, setNewTerms] = useState('1x');

  const [selectedProj, setSelectedProj] = useState(null);
  const [editSplits, setEditSplits] = useState([]); 

  useFocusEffect(
    useCallback(() => {
      fetchFinanceData();
    }, [])
  );

  async function fetchFinanceData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUser(user);

    try {
      const { data: usersData } = await supabase.from('profiles').select('id, full_name').neq('id', user.id);
      setAllUsers(usersData || []);

      const { data: mySplits } = await supabase.from('finance_splits').select('project_id').eq('user_id', user.id);
      const myProjIds = mySplits ? mySplits.map(s => s.project_id) : [];

      let query = supabase.from('finance_projects')
        .select('*, finance_splits(*, profiles(full_name))')
        .order('created_at', { ascending: false });

      if (myProjIds.length > 0) {
        query = query.or(`created_by.eq.${user.id},id.in.(${myProjIds.join(',')})`);
      } else {
        query = query.eq('created_by', user.id);
      }
      
      const { data: projData } = await query;
      setProjects(projData || []);

      let incomeCalc = 0;
      if (projData) {
        projData.forEach(p => {
          const myJatah = p.finance_splits?.find(s => s.user_id === user.id);
          if (myJatah && myJatah.status === 'paid') {
            incomeCalc += Number(myJatah.amount);
          }
        });
      }
      setTotalIncome(incomeCalc);

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const formatRp = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka || 0);

  const handleCreateProject = async () => {
    const budgetInt = parseInput(newBudget);
    if (!newTitle || budgetInt <= 0) return Alert.alert('Error', 'Nama dan Biaya Produksi wajib diisi!');
    
    const { data: newProj, error } = await supabase.from('finance_projects').insert([{
      title: newTitle,
      total_budget: budgetInt,
      payment_terms: newTerms,
      created_by: currentUser.id
    }]).select().single();

    if (!error && newProj) {
      await supabase.from('finance_splits').insert([{
        project_id: newProj.id,
        user_id: currentUser.id,
        amount: budgetInt,
        amount_paid: 0, 
        payment_history: [],
        status: 'pending'
      }]);
      setCreateModal(false);
      setNewTitle(''); setNewBudget(''); setNewTerms('1x');
      fetchFinanceData(); 
    } else {
      Alert.alert('Gagal', error.message);
    }
  };

  const openManageModal = (proj) => {
    setSelectedProj(proj);
    const teamSplits = proj.finance_splits.filter(s => s.user_id !== proj.created_by).map(s => ({
      id: s.id,
      user_id: s.user_id,
      name: s.profiles?.full_name,
      amountStr: formatInput(s.amount), 
      amount: s.amount,
      amount_paid: s.amount_paid || 0, 
      payment_history: s.payment_history || [],
      status: s.status
    }));
    setEditSplits(teamSplits);
    setManageModal(true);
  };

  const addMemberToProject = async (userToAdd) => {
    if (editSplits.find(m => m.user_id === userToAdd.id)) return Alert.alert('Info', 'User sudah ada.');
    const newSplit = { project_id: selectedProj.id, user_id: userToAdd.id, amount: 0, amount_paid: 0, payment_history: [], status: 'pending' };
    const { data, error } = await supabase.from('finance_splits').insert([newSplit]).select('*, profiles(full_name)').single();
    if (!error && data) {
      setEditSplits([...editSplits, { id: data.id, user_id: data.user_id, name: data.profiles.full_name, amountStr: '0', amount: 0, amount_paid: 0, payment_history: [], status: 'pending' }]);
      fetchFinanceData(); 
    }
  };

  const handleAmountChange = (splitId, text) => {
    const formatted = formatInput(text);
    setEditSplits(editSplits.map(s => s.id === splitId ? { ...s, amountStr: formatted, amount: parseInput(text) } : s));
  };

  const saveSplits = async () => {
    const totalBudget = selectedProj.total_budget;
    const totalTim = editSplits.reduce((sum, s) => sum + parseInput(s.amountStr), 0);
    const sisaOwner = totalBudget - totalTim;

    if (sisaOwner < 0) return Alert.alert('Minus Bro!', 'Pembagian ke tim melebihi Total Anggaran Project.');

    for (let s of editSplits) {
      const newAmount = parseInput(s.amountStr);
      const newStatus = s.amount_paid >= newAmount && newAmount > 0 ? 'paid' : 'pending';
      await supabase.from('finance_splits').update({ amount: newAmount, status: newStatus }).eq('id', s.id);
    }

    const ownerSplit = selectedProj.finance_splits.find(s => s.user_id === selectedProj.created_by);
    if (ownerSplit) {
      const ownerStatus = ownerSplit.amount_paid >= sisaOwner && sisaOwner > 0 ? 'paid' : 'pending';
      await supabase.from('finance_splits').update({ amount: sisaOwner, status: ownerStatus }).eq('id', ownerSplit.id);
    }

    Alert.alert('Sukses', 'Distribusi anggaran tersimpan.');
    fetchFinanceData(); 
  };

  const openTerminModal = (split, projTerms, ownerPaidAmount) => {
    if (split.user_id !== currentUser.id && ownerPaidAmount <= 0) {
      return Alert.alert('Kas Kosong', 'Uang project dari Klien belum cair ke Owner sama sekali (Saldo Rp 0). Anda tidak bisa membagikan dana ke tim.');
    }
    setSelectedSplitToPay(split);
    setSelectedProjTermin(projTerms);
    setPayAmount('');
    setTerminModal(true);
  };

  const submitTerminPayment = async () => {
    const nominalBayar = parseInput(payAmount);
    if (nominalBayar <= 0) return Alert.alert('Error', 'Masukkan nominal yang valid.');

    const targetAmount = selectedSplitToPay.amount || parseInput(selectedSplitToPay.amountStr);
    const currentPaid = selectedSplitToPay.amount_paid || 0;
    const sisaHutang = targetAmount - currentPaid;

    const maxTermin = parseInt(selectedProjTermin.replace(/\D/g, '')) || 1;
    const history = selectedSplitToPay.payment_history || [];
    const terminKe = history.length + 1;

    if (nominalBayar > sisaHutang) {
      return Alert.alert('Kelebihan Bayar!', `Sisa tagihan tinggal ${formatRp(sisaHutang)}. Tidak bisa lebih dari itu.`);
    }

    if (terminKe > maxTermin) {
      return Alert.alert('Maksimal Termin', `Sistem project ini hanya mengizinkan ${maxTermin}x pembayaran.`);
    }

    if (terminKe === maxTermin && nominalBayar < sisaHutang) {
      return Alert.alert('Wajib Lunas!', `Ini adalah termin terakhir (${maxTermin}/${maxTermin}). Anda WAJIB melunasi sisa tagihan sebesar ${formatRp(sisaHutang)}.`);
    }

    const newTotalPaid = currentPaid + nominalBayar;
    const isNowPaid = newTotalPaid >= targetAmount;
    const newHistory = [...history, { termin: terminKe, amount: nominalBayar, date: new Date().toISOString() }];

    const { error } = await supabase.from('finance_splits')
      .update({ 
        amount_paid: newTotalPaid, 
        payment_history: newHistory,
        status: isNowPaid ? 'paid' : 'pending' 
      }).eq('id', selectedSplitToPay.id);

    if (!error) {
      setTerminModal(false);
      Alert.alert('Berhasil', isNowPaid ? 'Pembayaran LUNAS!' : `Termin ke-${terminKe} berhasil dicatat.`);
      
      if (manageModal) {
         setEditSplits(editSplits.map(s => s.id === selectedSplitToPay.id ? { ...s, amount_paid: newTotalPaid, payment_history: newHistory, status: isNowPaid ? 'paid' : 'pending' } : s));
      }
      fetchFinanceData(); 
    } else {
      Alert.alert('Gagal', error.message);
    }
  };

  const deleteProject = async (projId) => {
    Alert.alert("Hapus Project?", "Data project dan pembagiannya akan hilang permanen.", [
      { text: "Batal", style: "cancel" },
      { text: "Hapus", onPress: async () => {
          await supabase.from('finance_projects').delete().eq('id', projId);
          fetchFinanceData();
      }}
    ]);
  };

  const calcTotalTimModal = editSplits.reduce((sum, s) => sum + parseInput(s.amountStr), 0);
  const calcSisaOwnerModal = (selectedProj?.total_budget || 0) - calcTotalTimModal;

  // --- LOGIKA FILTER & SEARCH ---
  const displayedProjects = projects.filter(proj => {
    // Filter by Search Query
    const matchSearch = proj.title.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by Role
    let matchRole = true;
    if (filterRole === 'owner') {
      matchRole = proj.created_by === currentUser?.id;
    } else if (filterRole === 'member') {
      matchRole = proj.created_by !== currentUser?.id;
    }

    return matchSearch && matchRole;
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color="#0F172A" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Akuntansi ACS</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        
        <View style={styles.walletCard}>
          <View style={styles.walletTop}>
            <View>
              <Text style={styles.walletLabel}>Uang Masuk ke Anda</Text>
              <Text style={styles.walletAmount}>{formatRp(totalIncome)}</Text>
            </View>
            <View style={styles.walletIconBg}><Ionicons name="cash" size={32} color="#F59E0B" /></View>
          </View>
          <Text style={styles.walletSub}>Akumulasi dari project yang status jatah Anda sudah LUNAS sepenuhnya.</Text>
        </View>

        {/* --- UI SEARCH & FILTER --- */}
        <View style={styles.searchFilterContainer}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color="#94A3B8" />
            <TextInput 
              style={styles.searchInput} 
              placeholder="Cari nama project..." 
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.filterTabs}>
            <TouchableOpacity style={[styles.filterTab, filterRole === 'all' && styles.filterTabActive]} onPress={() => setFilterRole('all')}>
              <Text style={[styles.filterTabText, filterRole === 'all' && styles.filterTabTextActive]}>Semua</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterTab, filterRole === 'owner' && styles.filterTabActive]} onPress={() => setFilterRole('owner')}>
              <Text style={[styles.filterTabText, filterRole === 'owner' && styles.filterTabTextActive]}>Milik Saya</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterTab, filterRole === 'member' && styles.filterTabActive]} onPress={() => setFilterRole('member')}>
              <Text style={[styles.filterTabText, filterRole === 'member' && styles.filterTabTextActive]}>Tim</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Buku Kas Project</Text></View>

        {loading ? <ActivityIndicator color="#6366F1" style={{marginTop: 20}} /> : (
          displayedProjects.length > 0 ? displayedProjects.map(proj => {
            const isOwner = proj.created_by === currentUser?.id;
            const mySplit = proj.finance_splits?.find(s => s.user_id === currentUser?.id);
            const ownerSplitData = proj.finance_splits?.find(s => s.user_id === proj.created_by);
            const totalTim = proj.finance_splits?.filter(s => s.user_id !== proj.created_by).reduce((sum, s) => sum + Number(s.amount), 0) || 0;

            return (
              <View key={proj.id} style={styles.projectCard}>
                <View style={styles.projHeader}>
                  <Text style={styles.projTitle} numberOfLines={1}>{proj.title}</Text>
                  {isOwner && <View style={styles.roleBadge}><Text style={styles.roleText}>Owner</Text></View>}
                </View>

                <View style={styles.financeInfo}>
                  <Text style={styles.infoText}>Biaya Produksi: <Text style={styles.boldNum}>{formatRp(proj.total_budget)}</Text></Text>
                  <Text style={styles.infoText}>Sistem Termin: <Text style={styles.boldNum}>{proj.payment_terms}</Text></Text>
                  {isOwner && (
                    <View style={styles.ownerDetailBox}>
                      <Text style={styles.detailText}>Dialokasikan ke Tim: <Text style={{color: '#EF4444'}}>- {formatRp(totalTim)}</Text></Text>
                      <View style={{height: 1, backgroundColor: '#E2E8F0', marginVertical: 6}} />
                      <Text style={styles.detailText}>Sisa Bersih (Owner): <Text style={{color: '#10B981'}}>{formatRp(ownerSplitData?.amount || 0)}</Text></Text>
                    </View>
                  )}
                </View>

                <View style={styles.splitBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.splitLabel}>Total Jatah Anda:</Text>
                    <Text style={styles.splitAmount}>{mySplit ? formatRp(mySplit.amount) : 'Belum diset'}</Text>
                    {mySplit && (
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4, fontWeight: '600' }}>
                        Sudah Dibayar: <Text style={{color: '#10B981'}}>{formatRp(mySplit.amount_paid)}</Text>
                      </Text>
                    )}
                  </View>
                  
                  {mySplit && (
                    <TouchableOpacity 
                      style={[styles.statusBtn, { backgroundColor: mySplit.status === 'paid' ? '#D1FAE5' : '#FEF3C7' }]}
                      onPress={() => isOwner && mySplit.status !== 'paid' ? openTerminModal(mySplit, proj.payment_terms, ownerSplitData?.amount_paid || 0) : null}
                      disabled={!isOwner || mySplit.status === 'paid'}
                    >
                      <Ionicons name={mySplit.status === 'paid' ? "checkmark-circle" : "wallet"} size={16} color={mySplit.status === 'paid' ? '#10B981' : '#F59E0B'} />
                      <Text style={[styles.statusBtnText, {color: mySplit.status === 'paid' ? '#10B981' : '#F59E0B' }]}>
                        {mySplit.status === 'paid' ? 'LUNAS' : (isOwner ? 'BAYAR TERMIN' : 'PROGRES')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {isOwner && (
                  <View style={styles.ownerActions}>
                    <TouchableOpacity style={styles.manageBtn} onPress={() => openManageModal(proj)}>
                      <Ionicons name="people" size={16} color="#FFF" />
                      <Text style={styles.manageBtnText}>Bagi Hasil Tim</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteProject(proj.id)}><Ionicons name="trash" size={16} color="#EF4444" /></TouchableOpacity>
                  </View>
                )}
              </View>
            )
          }) : (
            <View style={styles.emptyContainer}>
              <Ionicons name={searchQuery ? "search-outline" : "wallet-outline"} size={48} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>
                {searchQuery ? "Project tidak ditemukan" : "Buku Kas Kosong"}
              </Text>
            </View>
          )
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setCreateModal(true)}><Ionicons name="add" size={32} color="#FFF" /></TouchableOpacity>

      {/* MODAL 1: CREATE PROJECT */}
      <Modal visible={createModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Buka Kas Project</Text>
              <TouchableOpacity onPress={() => setCreateModal(false)}><Ionicons name="close" size={24} color="#64748B"/></TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Nama Project</Text>
            <TextInput style={styles.input} placeholder="Cth: Aplikasi TaniTrade" value={newTitle} onChangeText={setNewTitle} />
            
            <Text style={styles.inputLabel}>Total Biaya Produksi (Rp)</Text>
            <TextInput style={styles.input} placeholder="Cth: 1.000.000" keyboardType="numeric" value={newBudget} onChangeText={(val) => setNewBudget(formatInput(val))} />
            
            <Text style={styles.inputLabel}>Sistem Termin</Text>
            <View style={styles.termsRow}>
              {['1x', '2x', '3x'].map(t => (
                <TouchableOpacity key={t} style={[styles.termBtn, newTerms === t && styles.termBtnActive]} onPress={() => setNewTerms(t)}><Text style={[styles.termText, newTerms === t && styles.termTextActive]}>{t}</Text></TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.submitBtn} onPress={handleCreateProject}><Text style={styles.submitBtnText}>Simpan & Buat</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: MANAGE TIM & SPLIT */}
      <Modal visible={manageModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Distribusi Pembayaran</Text>
              <TouchableOpacity onPress={() => setManageModal(false)}><Ionicons name="close" size={24} color="#64748B"/></TouchableOpacity>
            </View>
            
            <View style={styles.calcPanel}>
              <Text style={styles.calcText}>Total Anggaran: {formatRp(selectedProj?.total_budget)}</Text>
              <Text style={styles.calcText}>Diberikan ke Tim: -{formatRp(calcTotalTimModal)}</Text>
              <View style={styles.divider} />
              <Text style={[styles.calcTextBold, { color: calcSisaOwnerModal < 0 ? '#EF4444' : '#10B981'}]}>Sisa (Jatah Anda): {formatRp(calcSisaOwnerModal)}</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitleModal}>Daftar Anggota Tim</Text>
              {editSplits.length === 0 ? <Text style={styles.emptyText}>Belum ada anggota.</Text> : null}
              
              {editSplits.map((mem) => {
                const isLunas = mem.status === 'paid';
                const ownerSplitData = selectedProj?.finance_splits.find(s => s.user_id === selectedProj.created_by);
                
                return (
                <View key={mem.id} style={styles.memberRow}>
                  <View style={{flex: 1}}>
                    <Text style={styles.memberName}>{mem.name}</Text>
                    <Text style={{fontSize: 10, color: '#64748B', marginTop: 2}}>Telah Dibayar: {formatRp(mem.amount_paid)}</Text>
                    
                    <TouchableOpacity onPress={() => !isLunas ? openTerminModal(mem, selectedProj?.payment_terms, ownerSplitData?.amount_paid || 0) : null} style={styles.statusToggleBtn}>
                      <Ionicons name={isLunas ? "checkmark-circle" : "wallet"} size={14} color={isLunas ? "#10B981" : "#F59E0B"} />
                      <Text style={[styles.statusToggleText, {color: isLunas ? "#10B981" : "#F59E0B"}]}>
                        {isLunas ? 'LUNAS' : 'BAYAR TERMIN'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View>
                    <Text style={{fontSize: 10, color: '#94A3B8', marginBottom: 2, textAlign: 'right'}}>Total Jatah</Text>
                    <TextInput 
                      style={styles.inputSplit} 
                      placeholder="0" 
                      keyboardType="numeric" 
                      value={mem.amountStr} 
                      onChangeText={(val) => handleAmountChange(mem.id, val)}
                    />
                  </View>
                </View>
              )})}

              <Text style={styles.sectionTitleModal}>Tambah Tim Baru</Text>
              {allUsers.filter(u => !editSplits.find(pm => pm.user_id === u.id)).map(user => (
                <View key={user.id} style={styles.addUserRow}>
                  <Text style={styles.addUserName}>{user.full_name}</Text>
                  <TouchableOpacity style={styles.addBtn} onPress={() => addMemberToProject(user)}><Text style={styles.addBtnText}>+ Tambah</Text></TouchableOpacity>
                </View>
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
            
            <TouchableOpacity style={styles.saveSplitsBtn} onPress={saveSplits}><Text style={styles.saveSplitsText}>Simpan Pengaturan Jatah</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: INPUT BAYAR TERMIN */}
      <Modal visible={terminModal} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.terminModalContent}>
            <Text style={styles.terminModalTitle}>Proses Bayar Termin</Text>
            
            {selectedSplitToPay && (
              <View style={{marginBottom: 20, width: '100%', backgroundColor: '#F8FAFC', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0'}}>
                <Text style={{color: '#475569', fontSize: 13, marginBottom: 5}}>Penerima: <Text style={{fontWeight: '800', color: '#0F172A'}}>{selectedSplitToPay.name || 'Anda'}</Text></Text>
                
                {selectedSplitToPay.payment_history && selectedSplitToPay.payment_history.length > 0 && (
                  <View style={{marginTop: 5, marginBottom: 10}}>
                    {selectedSplitToPay.payment_history.map(h => (
                       <Text key={h.termin} style={{fontSize: 11, color: '#64748B'}}>✔ Termin {h.termin}: {formatRp(h.amount)}</Text>
                    ))}
                  </View>
                )}

                <View style={{height: 1, backgroundColor: '#CBD5E1', marginVertical: 8}} />
                <Text style={{color: '#EF4444', fontSize: 14, fontWeight: '900'}}>
                  Sisa Tagihan: {formatRp((selectedSplitToPay.amount || parseInput(selectedSplitToPay.amountStr)) - (selectedSplitToPay.amount_paid || 0))}
                </Text>
              </View>
            )}
            
            <Text style={{alignSelf: 'flex-start', fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 8}}>Nominal Transfer (Rp)</Text>
            <TextInput 
              style={[styles.input, {width: '100%', marginBottom: 25}]} 
              placeholder={
                selectedSplitToPay && ((selectedSplitToPay.payment_history?.length || 0) + 1 === parseInt(selectedProjTermin.replace(/\D/g, ''))) 
                ? "Wajib Lunas sisa tagihan" 
                : "Cth: 500.000"
              }
              keyboardType="numeric" 
              value={payAmount} 
              onChangeText={(val) => setPayAmount(formatInput(val))} 
            />

            <View style={{flexDirection: 'row', gap: 10, width: '100%'}}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTerminModal(false)}><Text style={styles.cancelBtnText}>Batal</Text></TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={submitTerminPayment}><Text style={styles.confirmBtnText}>Konfirmasi Bayar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ... STYLE ...
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#F1F5F9' },
  backBtn: { padding: 8, backgroundColor: '#F1F5F9', borderRadius: 12 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  walletCard: { margin: 20, backgroundColor: '#0F172A', borderRadius: 24, padding: 25, elevation: 10 },
  walletTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  walletLabel: { color: '#94A3B8', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  walletAmount: { color: '#F59E0B', fontSize: 32, fontWeight: '900', marginTop: 4 },
  walletIconBg: { backgroundColor: 'rgba(245, 158, 11, 0.2)', padding: 12, borderRadius: 16 },
  walletSub: { color: '#64748B', fontSize: 12, fontWeight: '500' },
  
  // --- STYLE SEARCH & FILTER ---
  searchFilterContainer: { paddingHorizontal: 20, marginBottom: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#0F172A', fontWeight: '600' },
  filterTabs: { flexDirection: 'row', gap: 8 },
  filterTab: { flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  filterTabActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  filterTabText: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  filterTabTextActive: { color: '#FFF' },

  sectionHeader: { paddingHorizontal: 20, marginBottom: 15, marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  projectCard: { backgroundColor: '#FFF', marginHorizontal: 20, marginBottom: 20, padding: 20, borderRadius: 20, elevation: 4 },
  projHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  projTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', flex: 1 },
  roleBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginLeft: 10 },
  roleText: { color: '#6366F1', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  financeInfo: { backgroundColor: '#F8FAFC', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0' },
  infoText: { fontSize: 13, color: '#64748B', marginBottom: 4 },
  boldNum: { fontWeight: '900', color: '#0F172A' },
  ownerDetailBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  detailText: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 },
  splitBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 15, marginBottom: 15 },
  splitLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  splitAmount: { fontSize: 18, fontWeight: '900' },
  statusBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 4 },
  statusBtnText: { fontSize: 10, fontWeight: '900' },
  ownerActions: { flexDirection: 'row', gap: 10 },
  manageBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', padding: 14, borderRadius: 14, gap: 8 },
  manageBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  deleteBtn: { backgroundColor: '#FEF2F2', padding: 14, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  fab: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 30, right: 20, width: 64, height: 64, borderRadius: 32, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', elevation: 10 },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyTitle: { color: '#94A3B8', marginTop: 10, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  inputLabel: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, fontSize: 16, fontWeight: '900', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 20, color: '#0F172A' },
  termsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  termBtn: { flex: 1, padding: 15, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  termBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  termText: { fontSize: 14, fontWeight: '800', color: '#64748B' },
  termTextActive: { color: '#6366F1' },
  submitBtn: { backgroundColor: '#6366F1', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 10, marginBottom: Platform.OS === 'ios' ? 20 : 0 },
  submitBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  calcPanel: { backgroundColor: '#F8FAFC', padding: 15, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  calcText: { fontSize: 13, color: '#64748B', fontWeight: '600', marginBottom: 4 },
  calcTextBold: { fontSize: 15, fontWeight: '900' },
  sectionTitleModal: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 12, marginTop: 10 },
  emptyText: { color: '#94A3B8', fontSize: 13, fontStyle: 'italic', marginBottom: 15 },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 15, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  memberName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  statusToggleBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', alignSelf: 'flex-start'},
  statusToggleText: { fontSize: 10, fontWeight: '800', marginLeft: 4 },
  inputSplit: { backgroundColor: '#FFF', width: 130, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 15, fontWeight: '900', textAlign: 'right', color: '#0F172A' },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 10 },
  addUserRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  addUserName: { fontSize: 14, fontWeight: '700', color: '#475569' },
  addBtn: { backgroundColor: '#ECFDF5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { color: '#10B981', fontWeight: '800', fontSize: 12 },
  saveSplitsBtn: { backgroundColor: '#0F172A', padding: 18, borderRadius: 16, alignItems: 'center', marginBottom: Platform.OS === 'ios' ? 20 : 10 },
  saveSplitsText: { color: '#FFF', fontWeight: '900', fontSize: 16 },

  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  terminModalContent: { backgroundColor: '#FFF', width: '100%', borderRadius: 24, padding: 25, alignItems: 'center' },
  terminModalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 20 },
  cancelBtn: { flex: 1, backgroundColor: '#F1F5F9', padding: 16, borderRadius: 14, alignItems: 'center' },
  cancelBtnText: { color: '#475569', fontWeight: '800' },
  confirmBtn: { flex: 1, backgroundColor: '#10B981', padding: 16, borderRadius: 14, alignItems: 'center' },
  confirmBtnText: { color: '#FFF', fontWeight: '800' }
});